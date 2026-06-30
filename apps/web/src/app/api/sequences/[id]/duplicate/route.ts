import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { logger } from "@/lib/logger";
import { isNotFound, notFound } from "@/lib/auth/access";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;

    // Validate input
    if (!id) {
      return new NextResponse("Missing sequence ID", { status: 400 });
    }

    // Use a transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // First, fetch the original sequence
      const sequence = await tx.sequence.findUnique({
        where: {
          id: id,
          userId: session.user.id,
        },
        include: {
          steps: {
            orderBy: {
              order: "asc",
            },
          },
          businessHours: true,
          sequenceMailbox: true,
        },
      });

      if (!sequence) {
        throw new Error("Sequence not found");
      }

        // Create the new sequence with all required fields
        const newSequence = await tx.sequence.create({
          data: {
            name: `${sequence.name} (Copy)`,
            status: "draft",
            scheduleType: sequence.scheduleType || "business",
            accessLevel: sequence.accessLevel || "team",
            testMode: sequence.testMode ?? false,
            disableSending: sequence.disableSending ?? false,
            testEmails: sequence.testEmails || [],
            userId: session.user.id,
            businessHours: sequence.businessHours
              ? {
                  create: {
                    userId: session.user.id,
                    timezone: sequence.businessHours.timezone,
                    workDays: sequence.businessHours.workDays,
                    workHoursStart: sequence.businessHours.workHoursStart,
                    workHoursEnd: sequence.businessHours.workHoursEnd,
                  },
                }
              : undefined,
            sequenceMailbox: sequence.sequenceMailbox
              ? {
                  create: {
                    userId: session.user.id,
                    mailboxId: sequence.sequenceMailbox.mailboxId,
                    aliasId: sequence.sequenceMailbox.aliasId,
                  },
                }
              : undefined,
          },
        });

        if (!newSequence || !newSequence.id) {
          throw new Error("Failed to create new sequence");
        }

        // Create steps, mapping old ids → new ids so previousStepId can be
        // re-linked in a second pass.
        const stepIdMap = new Map<string, string>();
        const newSteps: Array<{ id: string; oldId: string }> = [];

        // First pass: create all steps without previousStepId
        for (const step of sequence.steps) {
          const newStep = await tx.sequenceStep.create({
            data: {
              sequenceId: newSequence.id,
              stepType: step.stepType || "manual_email",
              priority: step.priority || "medium",
              timing: step.timing || "immediate",
              delayAmount: step.delayAmount,
              delayUnit: step.delayUnit,
              subject: step.subject,
              content: step.content,
              includeSignature: step.includeSignature ?? true,
              note: step.note,
              order: step.order,
              replyToThread: step.replyToThread ?? false,
              templateId: step.templateId,
              previousStepId: null,
            },
          });

          if (!newStep || !newStep.id) {
            throw new Error(`Failed to create step for order ${step.order}`);
          }

          stepIdMap.set(step.id, newStep.id);
          newSteps.push({ id: newStep.id, oldId: step.id });
        }

        // Second pass: update previousStepId references
        for (const { id, oldId } of newSteps) {
          const originalStep = sequence.steps.find((s) => s.id === oldId);
          if (originalStep?.previousStepId) {
            const newPreviousStepId = stepIdMap.get(
              originalStep.previousStepId
            );
            if (newPreviousStepId) {
              await tx.sequenceStep.update({
                where: { id },
                data: { previousStepId: newPreviousStepId },
              });
            }
          }
        }

        // Fetch the final sequence with all its relations
        const duplicated = await tx.sequence.findUnique({
          where: { id: newSequence.id },
          include: {
            steps: { orderBy: { order: "asc" } },
            businessHours: true,
            sequenceMailbox: true,
            _count: { select: { contacts: true } },
          },
        });

        if (!duplicated) {
          throw new Error("Failed to retrieve duplicated sequence");
        }

        return { success: true, data: duplicated };
      });

    if (!result?.success || !result.data) {
      throw new Error("Transaction failed to return valid data");
    }

    return NextResponse.json(result.data);
  } catch (error) {
    // "Sequence not found" is thrown inside the transaction for both the
    // missing-row and wrong-tenant cases.
    if (error instanceof Error && error.message === "Sequence not found") {
      return notFound("Sequence not found");
    }
    if (isNotFound(error)) {
      return notFound("Sequence not found");
    }
    logger.error("[SEQUENCE_DUPLICATE]", error);
    return NextResponse.json(
      { error: "Failed to duplicate sequence" },
      { status: 500 }
    );
  }
}

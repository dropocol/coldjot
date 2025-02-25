import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { Prisma } from "@prisma/client";

// TODO :  improve the codebase
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log("[SEQUENCE_DUPLICATE] Starting sequence duplication process");

    const session = await auth();
    if (!session?.user) {
      console.log("[SEQUENCE_DUPLICATE] Unauthorized - No session user");
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;

    // Validate input
    if (!id) {
      console.log("[SEQUENCE_DUPLICATE] Missing sequence ID");
      return new NextResponse("Missing sequence ID", { status: 400 });
    }

    // Use a transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      try {
        console.log("[SEQUENCE_DUPLICATE] Starting transaction");

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

        console.log("[SEQUENCE_DUPLICATE] Found original sequence:", {
          id: sequence.id,
          name: sequence.name,
          stepsCount: sequence.steps.length,
        });

        // Create the new sequence with all required fields
        const newSequence = await tx.sequence.create({
          data: {
            name: `${sequence.name} (Copy)`,
            status: "draft",
            scheduleType: sequence.scheduleType || "business", // Ensure default value
            accessLevel: sequence.accessLevel || "team", // Ensure default value
            testMode: sequence.testMode ?? false,
            disableSending: sequence.disableSending ?? false,
            testEmails: sequence.testEmails || [],
            emailListId: sequence.emailListId,
            userId: session.user.id,
            businessHours: sequence.businessHours
              ? {
                  create: {
                    userId: session.user.id,
                    timezone: sequence.businessHours.timezone,
                    workDays: sequence.businessHours.workDays,
                    workHoursStart: sequence.businessHours.workHoursStart,
                    workHoursEnd: sequence.businessHours.workHoursEnd,
                    holidays: sequence.businessHours.holidays,
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

        console.log("[SEQUENCE_DUPLICATE] Created new sequence:", {
          id: newSequence.id,
          name: newSequence.name,
        });

        // Create steps with proper error handling
        const stepIdMap = new Map<string, string>();
        const newSteps: Array<{ id: string; oldId: string }> = [];

        // First pass: Create all steps without previousStepId
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

        // Second pass: Update previousStepId references
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
          where: {
            id: newSequence.id,
          },
          include: {
            steps: {
              orderBy: {
                order: "asc",
              },
            },
            businessHours: true,
            sequenceMailbox: true,
            _count: {
              select: {
                contacts: true,
              },
            },
          },
        });

        if (!duplicated) {
          throw new Error("Failed to retrieve duplicated sequence");
        }

        return { success: true, data: duplicated };
      } catch (txError) {
        console.error("[SEQUENCE_DUPLICATE] Transaction error:", {
          error:
            txError instanceof Error
              ? txError.message
              : "Unknown transaction error",
          stack: txError instanceof Error ? txError.stack : undefined,
        });
        throw txError; // Re-throw to trigger rollback
      }
    });

    if (!result?.success || !result.data) {
      throw new Error("Transaction failed to return valid data");
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[SEQUENCE_DUPLICATE] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      code:
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : undefined,
      meta:
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.meta
          : undefined,
    });

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return new NextResponse(`Database Error: ${error.message}`, {
        status: 400,
      });
    }

    return new NextResponse(
      `Internal Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 }
    );
  }
}

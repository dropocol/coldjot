"use server";

import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { revalidatePath } from "next/cache";

export async function updateOnboardingStep(step: number) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingStep: step },
  });
}

export async function completeOnboarding() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      onboardingCompleted: true,
      onboardingStep: undefined,
    },
  });

  revalidatePath("/onboarding");
}

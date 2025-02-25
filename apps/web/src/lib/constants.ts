export const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: "Welcome to ColdJot",
    description: "Let's get you set up with everything you need",
  },
  {
    id: "email",
    title: "Connect Your Email",
    description: "Set up your email account to start sending sequences",
  },
  {
    id: "business-hours",
    title: "Business Hours",
    description: "Configure when your emails should be sent",
  },
  {
    id: "contacts",
    title: "Contact Management",
    description: "Import or create your first contact list",
  },
  {
    id: "final",
    title: "Complete Setup",
    description: "Review your setup and start using ColdJot",
  },
] as const;

export const VALID_ONBOARDING_STEPS = ONBOARDING_STEPS.map((step) => step.id);

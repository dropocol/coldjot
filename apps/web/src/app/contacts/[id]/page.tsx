import ContactPageClient from "./contact-page-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ContactPage({ params }: PageProps) {
  const { id } = await params;
  return <ContactPageClient contactId={id} />;
}

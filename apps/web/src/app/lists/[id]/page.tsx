import { Metadata } from "next";
import ListDetailsView from "@/components/lists/list-details-view";

export const metadata: Metadata = {
  title: "Lists | Coldjot",
  description: "View and manage your email lists",
};

export default function ListDetailsPage() {
  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <ListDetailsView />
    </div>
  );
}

import { Metadata } from "next";
import ListDetailsView from "@/components/lists/list-details-view";

export const metadata: Metadata = {
  title: "List Details",
  description: "View and manage list contacts",
};

export default function ListDetailsPage() {
  return <ListDetailsView />;
}

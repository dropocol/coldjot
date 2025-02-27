// "use client";

// import { useState } from "react";
// import { Contact } from "@prisma/client";
// import { Button } from "@/components/ui/button";
// import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
// import { AddToSequenceModal } from "@/components/contacts/add-to-sequence-modal";
// import { SendHorizonal } from "lucide-react";

// export function ContactList({ contacts }: { contacts: Contact[] }) {
//   const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
//   const [showSequenceModal, setShowSequenceModal] = useState(false);

//   const handleAddToSequence = (contact: Contact) => {
//     setSelectedContact(contact);
//     setShowSequenceModal(true);
//   };

//   return (
//     <>
//       <div className="space-y-4">
//         <Table>
//           <TableBody>
//             {contacts.map((contact) => (
//               <TableRow key={contact.id}>
//                 <TableCell>
//                   <div className="flex items-center gap-2 justify-end">
//                     <Button
//                       variant="ghost"
//                       size="icon"
//                       onClick={() => handleAddToSequence(contact)}
//                       title="Add to sequence"
//                     >
//                       <SendHorizonal className="h-4 w-4" />
//                     </Button>
//                   </div>
//                 </TableCell>
//               </TableRow>
//             ))}
//           </TableBody>
//         </Table>
//       </div>

//       {selectedContact && (
//         <AddToSequenceModal
//           open={showSequenceModal}
//           onClose={() => {
//             setShowSequenceModal(false);
//             setSelectedContact(null);
//           }}
//           contact={selectedContact}
//         />
//       )}
//     </>
//   );
// }

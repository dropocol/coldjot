"use client";

import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { Contact } from "@prisma/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@coldjot/ui";
import { Button } from "@coldjot/ui";
import { Input } from "@coldjot/ui";
import { Label } from "@coldjot/ui";
import { Loader2 } from "lucide-react";
import { useUpdateContact } from "@/hooks/queries/use-contacts";

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
};

interface EditContactDrawerProps {
  contact: Contact;
  onClose: () => void;
  onSave: (contact: Contact) => void;
}

export default function EditContactDrawer({
  contact,
  onClose,
  onSave,
}: EditContactDrawerProps) {
  const updateContact = useUpdateContact(contact.id);
  const isSubmitting = updateContact.isPending;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      const updatedContact = await updateContact.mutateAsync(data);
      onSave(updatedContact as Contact);
      toast.success("Contact updated successfully");
    } catch (_error) {
      toast.error("Failed to update contact");
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-[800px] sm:max-w-[800px] h-[100dvh] p-0">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col h-full"
        >
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>Edit Contact</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    {...register("firstName", {
                      required: "First name is required",
                    })}
                    placeholder="Enter first name"
                  />
                  {errors.firstName && (
                    <p className="text-sm text-destructive">
                      {errors.firstName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    {...register("lastName", {
                      required: "Last name is required",
                    })}
                    placeholder="Enter last name"
                  />
                  {errors.lastName && (
                    <p className="text-sm text-destructive">
                      {errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...register("email", {
                    required: "Email is required",
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: "Invalid email address",
                    },
                  })}
                  placeholder="Enter email address"
                />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t mt-auto">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

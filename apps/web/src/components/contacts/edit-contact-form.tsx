"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { Contact } from "@prisma/client";
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

interface EditContactFormProps {
  contact: Contact;
}

export default function EditContactForm({ contact }: EditContactFormProps) {
  const router = useRouter();
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
      await updateContact.mutateAsync(data);
      toast.success("Contact updated successfully");
      router.refresh();
      router.push("/contacts");
    } catch (_error) {
      toast.error("Failed to update contact");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            {...register("firstName", { required: "First name is required" })}
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
            {...register("lastName", { required: "Last name is required" })}
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
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
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
    </form>
  );
}

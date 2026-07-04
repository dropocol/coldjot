import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@coldjot/ui";
import { Input } from "@coldjot/ui";
import { Button } from "@coldjot/ui";
import { Label } from "@coldjot/ui";

interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (url: string) => void;
  initialUrl?: string;
}

export function LinkDialog({
  open,
  onOpenChange,
  onSubmit,
  initialUrl = "",
}: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSubmit(url);
    setUrl("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent
        className="sm:max-w-[425px]"
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <DialogHeader>
          <DialogTitle>Add Link</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              type="url"
              required
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" onClick={(e) => e.stopPropagation()}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@coldjot/ui/components/card";
import { Avatar, AvatarFallback, AvatarImage } from "@coldjot/ui/components/avatar";

export default function ProfileSettings({ user }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium tracking-tight">Profile</h2>

      <Card>
        <CardHeader>
          <CardTitle>Your Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.image || ""} />
              <AvatarFallback>{user.name?.[0]}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

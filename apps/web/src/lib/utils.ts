import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
// import fs from "fs";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// export async function saveToFile(filePath: string, data: any) {
//   if (process.env.NODE_ENV === "development") {
//     await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
//   }
//   return;
// }

export function formatLinkedInUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Get the path without leading/trailing slashes
    const path = urlObj.pathname.replace(/^\/|\/$/g, "");
    // Get the last part of the path (usually the profile name/id)
    const profileName = path.split("/").pop();
    return profileName || url;
  } catch {
    return url;
  }
}

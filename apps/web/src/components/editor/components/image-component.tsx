// "use client";

// import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
// import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
// import { mergeRegister } from "@lexical/utils";
// import {
//   $getNodeByKey,
//   $getSelection,
//   $isNodeSelection,
//   COMMAND_PRIORITY_LOW,
//   KEY_BACKSPACE_COMMAND,
//   KEY_DELETE_COMMAND,
//   NodeKey,
// } from "lexical";
// import Image from "next/image";
// import { useCallback, useEffect, useRef } from "react";

// interface ImageComponentProps {
//   src: string;
//   altText: string;
//   width?: number;
//   height?: number;
//   caption?: string;
//   nodeKey: NodeKey;
// }

// export function ImageComponent({
//   src,
//   altText,
//   width,
//   height,
//   caption,
//   nodeKey,
// }: ImageComponentProps) {
//   const imageRef = useRef<HTMLImageElement>(null);
//   const [editor] = useLexicalComposerContext();
//   const [isSelected, setSelected, clearSelection] =
//     useLexicalNodeSelection(nodeKey);

//   const onDelete = useCallback(
//     (payload: KeyboardEvent) => {
//       if (isSelected && $isNodeSelection($getSelection())) {
//         const event: KeyboardEvent = payload;
//         event.preventDefault();
//         const node = $getNodeByKey(nodeKey);
//         if (node) {
//           node.remove();
//         }
//         return true;
//       }
//       return false;
//     },
//     [isSelected, nodeKey]
//   );

//   useEffect(() => {
//     return mergeRegister(
//       editor.registerCommand(
//         KEY_DELETE_COMMAND,
//         onDelete,
//         COMMAND_PRIORITY_LOW
//       ),
//       editor.registerCommand(
//         KEY_BACKSPACE_COMMAND,
//         onDelete,
//         COMMAND_PRIORITY_LOW
//       )
//     );
//   }, [editor, onDelete]);

//   return (
//     <div className="relative" draggable="true">
//       <div
//         className={`relative ${
//           isSelected ? "ring-2 ring-primary ring-offset-2" : ""
//         }`}
//       >
//         <Image
//           ref={imageRef}
//           src={src}
//           alt={altText}
//           width={width || 800}
//           height={height || 600}
//           className="max-w-full h-auto rounded-lg"
//           onClick={() => {
//             setSelected(true);
//           }}
//         />
//       </div>
//       {caption && (
//         <div className="text-center text-sm text-muted-foreground mt-2">
//           {caption}
//         </div>
//       )}
//     </div>
//   );
// }

/**
 * Whether "Save image" is offered. Only for files of the workspace: the bytes of an address on the web
 * (`https:`, `data:`, `blob:`) cannot be requested from the page under its content security policy, and
 * such an image is not the user's file to save from here.
 *
 * Its own tiny module: the node editor decides this synchronously, while the code that does the saving
 * is loaded only when an image is opened.
 */
export function canSaveOriginal(path: string): boolean {
  return !/^(https?:|data:|blob:)/i.test(path);
}

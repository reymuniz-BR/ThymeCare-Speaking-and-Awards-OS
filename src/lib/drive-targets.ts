/** Only this Drive folder (and its subfolders) is indexed into the Content Library. */
import { workspaceConfig } from "@/lib/workspace";
export const ROOT_FOLDER_ID = workspaceConfig().drive.rootFolderId;

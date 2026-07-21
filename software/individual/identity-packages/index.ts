export { irisManifest } from "./iris";
export { morrowManifest } from "./morrow";
export { sableManifest } from "./sable";

import { irisManifest } from "./iris";
import { morrowManifest } from "./morrow";
import { sableManifest } from "./sable";

export const identityPackages = [irisManifest, morrowManifest, sableManifest] as const;

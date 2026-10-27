export const MAX_IMPORT_MB = 3;
export const MAX_IMPORT_BYTES = MAX_IMPORT_MB * 1024 * 1024;
export const tooBigMessage = () => `This file is larger than ${MAX_IMPORT_MB} MB. Export a single cutoff from the device and try again.`;

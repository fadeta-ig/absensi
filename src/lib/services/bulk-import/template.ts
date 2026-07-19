import { readFile } from "fs/promises";
import path from "path";

export async function generateTemplate(): Promise<Buffer> {
    return readFile(path.join(process.cwd(), "public", "templates", "Template_Import_Karyawan_V2.xlsx"));
}

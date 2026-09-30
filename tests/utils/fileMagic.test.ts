import { describe, expect, it } from "vitest";
import {
    ALLOWED_UPLOAD_MIME,
    assertAllowedFile,
    extensionForMime,
    hasExpectedSignature,
} from "@/lib/fileMagic";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function concat(...parts: Buffer[]): Buffer {
    return Buffer.concat(parts);
}

const pdfBuffer = concat(Buffer.from("%PDF-1.7\n", "ascii"), Buffer.from([1, 2, 3]));
const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
const pngBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const webpBuffer = concat(
    Buffer.from("RIFF", "ascii"),
    Buffer.from([10, 0, 0, 0]),
    Buffer.from("WEBP", "ascii"),
    Buffer.from([4, 5, 6]),
);
const gif89Buffer = concat(Buffer.from("GIF89a", "ascii"), Buffer.from([1, 2, 3]));
const gif87Buffer = concat(Buffer.from("GIF87a", "ascii"), Buffer.from([1, 2, 3]));
const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 10, 20, 30]);
const oleBuffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 9, 9]);
const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");
const htmlBuffer = Buffer.from("<!DOCTYPE html><html><body>hi</body></html>", "utf8");
const corruptBuffer = Buffer.from("hello world, bukan file asli", "utf8");

describe("fileMagic", () => {
    it("memetakan ekstensi dari MIME server, bukan dari nama file", () => {
        expect(extensionForMime("image/jpeg")).toBe(".jpg");
        expect(extensionForMime("image/png")).toBe(".png");
        expect(extensionForMime("image/webp")).toBe(".webp");
        expect(extensionForMime("image/gif")).toBe(".gif");
        expect(extensionForMime("application/pdf")).toBe(".pdf");
        expect(extensionForMime("application/msword")).toBe(".doc");
        expect(extensionForMime(DOCX_MIME)).toBe(".docx");
        expect(extensionForMime("application/vnd.ms-excel")).toBe(".xls");
        expect(extensionForMime(XLSX_MIME)).toBe(".xlsx");
        expect(extensionForMime("application/vnd.ms-powerpoint")).toBe(".ppt");
        expect(extensionForMime(PPTX_MIME)).toBe(".pptx");
        expect(extensionForMime("image/svg+xml")).toBeNull();
        expect(extensionForMime("text/html")).toBeNull();
    });

    it("menerima tiap tipe valid sesuai magic-byte", () => {
        expect(hasExpectedSignature("application/pdf", pdfBuffer)).toBe(true);
        expect(hasExpectedSignature("image/jpeg", jpegBuffer)).toBe(true);
        expect(hasExpectedSignature("image/png", pngBuffer)).toBe(true);
        expect(hasExpectedSignature("image/webp", webpBuffer)).toBe(true);
        expect(hasExpectedSignature("image/gif", gif89Buffer)).toBe(true);
        expect(hasExpectedSignature("image/gif", gif87Buffer)).toBe(true);
        expect(hasExpectedSignature(DOCX_MIME, zipBuffer)).toBe(true);
        expect(hasExpectedSignature(XLSX_MIME, zipBuffer)).toBe(true);
        expect(hasExpectedSignature(PPTX_MIME, zipBuffer)).toBe(true);
        expect(hasExpectedSignature("application/msword", oleBuffer)).toBe(true);
        expect(hasExpectedSignature("application/vnd.ms-excel", oleBuffer)).toBe(true);
        expect(hasExpectedSignature("application/vnd.ms-powerpoint", oleBuffer)).toBe(true);
    });

    it("menerima file valid lewat assertAllowedFile dan mengembalikan ekstensi", () => {
        expect(assertAllowedFile(pdfBuffer, "application/pdf")).toBe(".pdf");
        expect(assertAllowedFile(jpegBuffer, "image/jpeg")).toBe(".jpg");
        expect(assertAllowedFile(zipBuffer, XLSX_MIME)).toBe(".xlsx");
    });

    it("menolak svg dan html", () => {
        expect(hasExpectedSignature("image/svg+xml", svgBuffer)).toBe(false);
        expect(hasExpectedSignature("text/html", htmlBuffer)).toBe(false);
        expect(ALLOWED_UPLOAD_MIME.includes("image/svg+xml")).toBe(false);
        expect(ALLOWED_UPLOAD_MIME.includes("text/html")).toBe(false);
        expect(() => assertAllowedFile(svgBuffer, "image/svg+xml")).toThrow();
        expect(() => assertAllowedFile(htmlBuffer, "text/html")).toThrow();
    });

    it("menolak buffer korup atau signature yang tidak cocok", () => {
        expect(hasExpectedSignature("application/pdf", corruptBuffer)).toBe(false);
        expect(hasExpectedSignature("image/jpeg", pngBuffer)).toBe(false);
        expect(hasExpectedSignature("image/png", jpegBuffer)).toBe(false);
        expect(hasExpectedSignature(XLSX_MIME, corruptBuffer)).toBe(false);
        expect(hasExpectedSignature(XLSX_MIME, Buffer.alloc(0))).toBe(false);
        expect(() => assertAllowedFile(corruptBuffer, "application/pdf")).toThrow();
        expect(() => assertAllowedFile(pngBuffer, "image/jpeg")).toThrow();
        expect(() => assertAllowedFile(Buffer.alloc(0), "image/png")).toThrow();
    });
});

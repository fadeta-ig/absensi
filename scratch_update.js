const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

schema = schema.replace(
  '  createdAt      DateTime     @default(now()) @map("created_at")\r\n\r\n  @@map("asset_histories")\r\n}',
  '  createdAt      DateTime     @default(now()) @map("created_at")\r\n  bastDocuments  AssetBastDocument[]\r\n\r\n  @@map("asset_histories")\r\n}'
);

schema = schema.replace(
  '  createdAt      DateTime     @default(now()) @map("created_at")\n\n  @@map("asset_histories")\n}',
  '  createdAt      DateTime     @default(now()) @map("created_at")\n  bastDocuments  AssetBastDocument[]\n\n  @@map("asset_histories")\n}'
);

const newModel = `
// ─── Asset BAST (Berita Acara Serah Terima) ─────────────────────

model AssetBastDocument {
  id           String       @id @default(uuid())
  historyId    String       @map("history_id")
  fileUrl      String       @map("file_url")
  fileName     String       @map("file_name")
  uploadedBy   String       @map("uploaded_by") // employeeId of GA
  createdAt    DateTime     @default(now()) @map("created_at")

  history      AssetHistory @relation(fields: [historyId], references: [id], onDelete: Cascade)

  @@index([historyId], map: "idx_bast_documents_history_id")
  @@map("asset_bast_documents")
}
`;

if (!schema.includes('AssetBastDocument')) {
    fs.writeFileSync('prisma/schema.prisma', schema + newModel);
    console.log("Schema updated");
} else {
    console.log("Already updated");
}

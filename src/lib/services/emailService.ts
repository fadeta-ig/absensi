import nodemailer from "nodemailer";
import logger from "@/lib/logger";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "WIG Attendance <noreply@wig.co.id>";

const isSmtpConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

function createTransporter() {
    if (!isSmtpConfigured) return null;
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,      // true untuk SSL (465), false untuk STARTTLS (587)
        requireTLS: SMTP_PORT === 587,  // wajib upgrade ke TLS untuk Gmail port 587
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
}

export interface SendPasswordOptions {
    employeeId?: string | null;
    username?: string | null;
    loginUrl?: string | null;
}

export async function sendPasswordEmail(
    email: string,
    name: string,
    password: string,
    options?: string | SendPasswordOptions
): Promise<boolean> {
    const opts: SendPasswordOptions = typeof options === "string"
        ? { employeeId: options, username: options }
        : (options ?? {});

    const employeeId = opts.employeeId?.trim() || null;
    const username = opts.username?.trim() || employeeId || email;
    const appUrl = (opts.loginUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://hris.wijayainovasi.co.id").replace(/\/$/, "");

    const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aktivasi Akun HRIS - PT Wijaya Inovasi Gemilang</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #18181b;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e4e4e7;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; border-bottom: 1px solid #f4f4f5;">
              <div style="color: #71717a; font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px;">
                PT WIJAYA INOVASI GEMILANG
              </div>
              <h1 style="color: #09090b; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.3px;">
                Aktivasi Akun HRIS
              </h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 28px 32px 32px;">
              
              <p style="font-size: 14px; line-height: 1.6; color: #27272a; margin: 0 0 16px;">
                Halo <strong>${name}</strong>,
              </p>
              <p style="font-size: 13.5px; line-height: 1.6; color: #52525b; margin: 0 0 24px;">
                Akun HRIS dan Presensi Kehadiran Anda pada PT Wijaya Inovasi Gemilang telah aktif. Berikut adalah rincian informasi kredensial akun Anda:
              </p>

              <!-- Account Details Table -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td width="36%" style="padding: 11px 14px; font-size: 12.5px; color: #71717a; border-bottom: 1px solid #f4f4f5; font-weight: 500;">
                    Nama Lengkap
                  </td>
                  <td style="padding: 11px 14px; font-size: 12.5px; color: #09090b; border-bottom: 1px solid #f4f4f5; font-weight: 600;">
                    ${name}
                  </td>
                </tr>
                ${employeeId ? `
                <tr>
                  <td style="padding: 11px 14px; font-size: 12.5px; color: #71717a; border-bottom: 1px solid #f4f4f5; font-weight: 500;">
                    NIP / ID Karyawan
                  </td>
                  <td style="padding: 11px 14px; font-size: 12.5px; color: #09090b; border-bottom: 1px solid #f4f4f5; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', Consolas, Monaco, monospace;">
                    ${employeeId}
                  </td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 11px 14px; font-size: 12.5px; color: #71717a; border-bottom: 1px solid #f4f4f5; font-weight: 500;">
                    Username Login
                  </td>
                  <td style="padding: 11px 14px; font-size: 12.5px; color: #09090b; border-bottom: 1px solid #f4f4f5; font-weight: 600;">
                    ${username}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 11px 14px; font-size: 12.5px; color: #71717a; font-weight: 500;">
                    Email Terdaftar
                  </td>
                  <td style="padding: 11px 14px; font-size: 12.5px; color: #09090b; font-weight: 500;">
                    ${email}
                  </td>
                </tr>
              </table>

              <!-- Password Highlight Card -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; text-align: center; margin-bottom: 24px;">
                <div style="color: #64748b; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px;">
                  KATA SANDI SEMENTARA
                </div>
                <div style="color: #0f172a; font-size: 20px; font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', Consolas, Monaco, monospace; font-weight: 700; letter-spacing: 3px; padding: 4px 0;">
                  ${password}
                </div>
                <div style="color: #94a3b8; font-size: 11.5px; margin-top: 4px;">
                  Perhatikan penggunaan huruf besar, huruf kecil, dan angka saat memasukkan kata sandi
                </div>
              </div>

              <!-- Action Button -->
              <div style="text-align: center; margin-bottom: 28px;">
                <a href="${appUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 13.5px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px;">
                  Masuk ke Portal HRIS
                </a>
                <div style="margin-top: 10px; font-size: 11.5px; color: #71717a;">
                  Tautan akses: <a href="${appUrl}" style="color: #0f172a; text-decoration: underline;">${appUrl}</a>
                </div>
              </div>

              <!-- Important Security Guidelines -->
              <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 14px 16px;">
                <div style="color: #18181b; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                  Panduan Keamanan &amp; Penggunaan
                </div>
                <ul style="margin: 0; padding-left: 18px; color: #52525b; font-size: 12px; line-height: 1.6;">
                  <li style="margin-bottom: 4px;">
                    <strong>Ubah Kata Sandi:</strong> Segera lakukan perubahan kata sandi Anda setelah berhasil masuk pertama kali melalui menu Pengaturan demi menjaga keamanan akun.
                  </li>
                  <li style="margin-bottom: 4px;">
                    <strong>Syarat Presensi Masuk &amp; Pulang:</strong> Absensi kehadiran harian (Clock In dan Clock Out) wajib dilakukan saat terhubung ke jaringan Wi-Fi kantor resmi dan GPS aktif.
                  </li>
                  <li>
                    <strong>Kerahasiaan Akun:</strong> Jangan membagikan informasi akun ini kepada siapa pun. Pihak manajemen atau tim IT tidak pernah meminta kata sandi Anda.
                  </li>
                </ul>
              </div>

            </td>
          </tr>

          <!-- Corporate Footer -->
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #f4f4f5; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 11px; color: #71717a; line-height: 1.5;">
                Email ini dikirimkan secara otomatis oleh Sistem HRIS &amp; Presensi PT Wijaya Inovasi Gemilang.
              </p>
              <p style="margin: 0; font-size: 11px; color: #a1a1aa;">
                &copy; 2026 PT Wijaya Inovasi Gemilang. Seluruh hak cipta dilindungi undang-undang.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (!isSmtpConfigured) {
        logger.warn("[Email] SMTP tidak dikonfigurasi — email tidak terkirim", {
            action: "send-password",
            recipient: email,
            recipientName: name,
        });
        return false;
    }

    try {
        const transporter = createTransporter()!;
        const text = `PT WIJAYA INOVASI GEMILANG
Sistem Informasi SDM & Layanan Mandiri Karyawan (HRIS)
--------------------------------------------------

INFORMASI KREDENSIAL AKUN LOGIN

Halo ${name},

Akun HRIS dan Presensi Kehadiran Anda pada PT Wijaya Inovasi Gemilang telah aktif. Berikut adalah rincian kredensial akun Anda:

- Nama Lengkap       : ${name}
${employeeId ? `- NIP / ID Karyawan  : ${employeeId}\n` : ""}- Username Login     : ${username}
- Email Terdaftar    : ${email}
- Alamat Web Portal  : ${appUrl}

--------------------------------------------------
KATA SANDI SEMENTARA:
${password}
--------------------------------------------------
(Salin atau ketik kata sandi di atas dengan teliti, perhatikan huruf besar dan kecil)

PANDUAN KEAMANAN & PENGGUNAAN:
1. Segera lakukan perubahan kata sandi Anda setelah login pertama kali melalui menu Pengaturan.
2. Presensi kehadiran harian (Clock In & Clock Out) wajib dilakukan saat terhubung ke jaringan Wi-Fi kantor resmi dan GPS aktif.
3. Jaga kerahasiaan akun dan jangan berikan kata sandi kepada siapa pun.

--------------------------------------------------
PT Wijaya Inovasi Gemilang
Email ini dikirimkan secara otomatis oleh sistem.`;

        await transporter.sendMail({
            from: SMTP_FROM,
            to: email,
            subject: "Informasi Kredensial Akun HRIS - PT Wijaya Inovasi Gemilang",
            text,
            html,
        });
        logger.info("[Email] Password email berhasil dikirim", {
            recipient: email,
            recipientName: name,
            employeeId,
        });
        return true;
    } catch (error) {
        logger.error("[Email] Gagal mengirim password email", {
            recipient: email,
            error,
        });
        return false;
    }
}

export async function sendPasswordChangedEmail(
    email: string,
    name: string
): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pemberitahuan Keamanan - Kata Sandi Diubah</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #18181b;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e4e4e7;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; border-bottom: 1px solid #f4f4f5;">
              <div style="color: #71717a; font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px;">
                PT WIJAYA INOVASI GEMILANG
              </div>
              <h1 style="color: #09090b; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.3px;">
                Pemberitahuan Keamanan Akun
              </h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 28px 32px 32px;">
              <p style="font-size: 14px; line-height: 1.6; color: #27272a; margin: 0 0 16px;">
                Halo <strong>${name}</strong>,
              </p>
              <p style="font-size: 13.5px; line-height: 1.6; color: #52525b; margin: 0 0 24px;">
                Kata sandi untuk akun HRIS &amp; Presensi Anda baru saja berhasil diperbarui. Seluruh sesi aktif di perangkat lain telah dihentikan secara otomatis demi menjaga keamanan akun Anda.
              </p>
              
              <!-- Security Warning Box -->
              <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 14px 16px;">
                <div style="color: #18181b; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                  Pemberitahuan Penting
                </div>
                <div style="color: #52525b; font-size: 12.5px; line-height: 1.6;">
                  Jika Anda <strong>tidak</strong> merasa melakukan perubahan kata sandi ini, segera hubungi tim IT Support atau Administrator HR perusahaan untuk mengamankan akun Anda.
                </div>
              </div>
            </td>
          </tr>

          <!-- Corporate Footer -->
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #f4f4f5; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 11px; color: #71717a; line-height: 1.5;">
                Email ini dikirimkan secara otomatis oleh Sistem HRIS PT Wijaya Inovasi Gemilang.
              </p>
              <p style="margin: 0; font-size: 11px; color: #a1a1aa;">
                &copy; 2026 PT Wijaya Inovasi Gemilang. Seluruh hak cipta dilindungi undang-undang.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (!isSmtpConfigured) {
        logger.warn("[Email] SMTP tidak dikonfigurasi — email peringatan password change tidak terkirim", {
            action: "password-changed",
            recipient: email,
        });
        return false;
    }

    try {
        const transporter = createTransporter();
        if (!transporter) return false;

        const text = `PT WIJAYA INOVASI GEMILANG
Pemberitahuan Keamanan Akun HRIS
--------------------------------------------------

Halo ${name},

Kata sandi untuk akun HRIS & Presensi Anda baru saja berhasil diperbarui. Seluruh sesi aktif di perangkat lain telah dihentikan secara otomatis demi menjaga keamanan akun Anda.

PEMBERITAHUAN PENTING:
Jika Anda tidak merasa melakukan perubahan kata sandi ini, segera hubungi tim IT Support atau Administrator HR perusahaan untuk mengamankan akun Anda.

--------------------------------------------------
PT Wijaya Inovasi Gemilang
Email ini dikirim secara otomatis oleh sistem.`;

        await transporter.sendMail({
            from: SMTP_FROM,
            to: email,
            subject: "Pemberitahuan Keamanan - Kata Sandi Diubah",

            text,
            html,
        });
        return true;
    } catch (error) {
        logger.error("[Email] Gagal mengirim email password changed", {
            recipient: email,
            error,
        });
        return false;
    }
}

export function isEmailConfigured(): boolean {
    return isSmtpConfigured;
}

export interface BirthdayReminderEmailItem {
    employeeId: string;
    name: string;
    position: string;
    department: string;
    birthDateFormatted: string;
    ageTurning: number;
    daysUntil: number;
    milestone: string;
    statusName?: string | null;
}

export async function sendBirthdayReminderEmail(
    recipients: string[],
    items: BirthdayReminderEmailItem[],
    milestoneTitle?: string
): Promise<{ success: boolean; message: string }> {
    if (!recipients.length) {
        return { success: false, message: "Tidak ada alamat email penerima yang ditentukan." };
    }
    if (!isSmtpConfigured) {
        logger.warn("[Email] SMTP belum dikonfigurasi — reminder ulang tahun tidak dapat dikirim", {
            recipients,
            itemCount: items.length,
        });
        return { success: false, message: "Layanan SMTP belum dikonfigurasi pada server (.env)." };
    }

    const timestamp = new Date().toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const rowsHtml = items.map((item) => {
        const scheduleBadge = item.daysUntil === 0
            ? '<span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#fee2e2;color:#991b1b;">Hari Ini</span>'
            : item.daysUntil <= 7
            ? `<span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;">${item.daysUntil} Hari Lagi (${item.milestone})</span>`
            : `<span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f1f5f9;color:#334155;">${item.daysUntil} Hari Lagi (${item.milestone})</span>`;

        const statusLabel = item.statusName
            ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#e2e8f0;color:#334155;">${item.statusName}</span>`
            : '<span style="color:#94a3b8;font-size:12px;">Belum Diproses</span>';

        return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 12px; font-weight: 600; color: #1e293b;">
                ${item.name}
                <div style="font-size: 11px; color: #64748b; font-weight: normal;">Usia ke-${item.ageTurning}</div>
            </td>
            <td style="padding: 10px 12px; color: #475569; font-size: 12px;">${item.department} &bull; ${item.position}</td>
            <td style="padding: 10px 12px; color: #800020; font-weight: 600; font-size: 12px;">${item.birthDateFormatted}</td>
            <td style="padding: 10px 12px; text-align: center;">${scheduleBadge}</td>
            <td style="padding: 10px 12px;">${statusLabel}</td>
        </tr>`;
    }).join("");

    const title = milestoneTitle || "Pengingat Persiapan Ulang Tahun Pegawai";

    const textContent = `PENGINGAT ULANG TAHUN PEGAWAI
PT Wijaya Inovasi Gemilang - HRIS System
==================================================

Berikut adalah daftar pegawai yang memiliki jadwal ulang tahun mendatang:

${items.map((item) => `- ${item.name} (${item.department} - ${item.position})
  Tanggal Lahir: ${item.birthDateFormatted} (Usia ke-${item.ageTurning})
  Jadwal: ${item.daysUntil === 0 ? "Hari Ini" : `${item.daysUntil} hari lagi (${item.milestone})`}
  Status: ${item.statusName || "Belum Diproses"}`).join("\n\n")}

==================================================
Catatan: Pembaruan status persiapan dan catatan dapat dilakukan melalui menu Ulang Tahun di Dashboard HRIS.
Waktu Pengiriman: ${timestamp} WIB
Email ini dikirimkan secara otomatis oleh Sistem HRIS WIG.`;

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;-webkit-font-smoothing:antialiased;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    <div style="height:4px;background:#800020;"></div>
    <div style="padding:28px 24px;">
      <div style="border-bottom:1px solid #f1f5f9;padding-bottom:16px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:1px;color:#64748b;text-transform:uppercase;margin-bottom:4px;">
          PT Wijaya Inovasi Gemilang
        </div>
        <div style="font-size:18px;font-weight:700;color:#0f172a;">
          ${title}
        </div>
      </div>

      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#475569;">
        Berikut adalah daftar pegawai yang memiliki jadwal ulang tahun dalam waktu dekat. Mohon periksa dan siapkan kebutuhan yang diperlukan sesuai dengan SOP internal.
      </p>

      <div style="overflow-x:auto;margin-bottom:20px;border:1px solid #e2e8f0;border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#475569;">
              <th style="padding:10px 12px;font-weight:600;">Nama Pegawai</th>
              <th style="padding:10px 12px;font-weight:600;">Divisi / Jabatan</th>
              <th style="padding:10px 12px;font-weight:600;">Tgl Lahir</th>
              <th style="padding:10px 12px;font-weight:600;text-align:center;">Jadwal</th>
              <th style="padding:10px 12px;font-weight:600;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div style="background:#f8fafc;border-left:3px solid #800020;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#475569;">
          <strong>Petunjuk HR:</strong> Untuk memperbarui status persiapan atau menambahkan catatan detail perayaan, silakan akses menu <strong>Ulang Tahun</strong> pada Dashboard HRIS.
        </p>
      </div>

      <div style="border-top:1px solid #f1f5f9;padding-top:16px;font-size:11px;color:#94a3b8;line-height:1.5;">
        <div>Email otomatis dari Sistem HRIS PT Wijaya Inovasi Gemilang.</div>
        <div style="margin-top:2px;">Waktu pengiriman: ${timestamp} WIB</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    try {
        const transporter = createTransporter();
        if (!transporter) {
            return { success: false, message: "Gagal membuat koneksi SMTP." };
        }

        await transporter.sendMail({
            from: SMTP_FROM,
            to: recipients.join(", "),
            subject: `Pengingat Ulang Tahun Pegawai - WIG HRIS (${items.length} Pegawai)`,
            text: textContent,
            html,
        });

        logger.info("[Email] Reminder ulang tahun berhasil dikirim", {
            recipients,
            itemCount: items.length,
        });

        return {
            success: true,
            message: `Email reminder berhasil dikirim ke ${recipients.length} alamat email.`,
        };
    } catch (error) {
        logger.error("[Email] Gagal mengirim reminder email", {
            recipients,
            error,
        });
        return {
            success: false,
            message: error instanceof Error ? error.message : "Terjadi kesalahan saat pengiriman email melalui SMTP.",
        };
    }
}

export async function sendTestBirthdayReminderEmail(
    recipients: string[]
): Promise<{ success: boolean; message: string }> {
    if (!recipients.length) {
        return { success: false, message: "Tentukan minimal satu alamat email penerima uji coba." };
    }
    if (!isSmtpConfigured) {
        return {
            success: false,
            message: "SMTP belum dikonfigurasi di file environment (.env). Pastikan SMTP_HOST, SMTP_USER, dan SMTP_PASS sudah terisi.",
        };
    }

    const testItems: BirthdayReminderEmailItem[] = [
        {
            employeeId: "WIG-TEST-01",
            name: "Budi Santoso",
            position: "Senior Software Engineer",
            department: "IT & Digital",
            birthDateFormatted: "15 September",
            ageTurning: 29,
            daysUntil: 7,
            milestone: "H-7",
            statusName: "Kue Dipesan",
        },
        {
            employeeId: "WIG-TEST-02",
            name: "Siti Rahma",
            position: "Account Executive",
            department: "Marketing",
            birthDateFormatted: "22 September",
            ageTurning: 26,
            daysUntil: 14,
            milestone: "H-14",
            statusName: "Kirim Ucapan",
        },
        {
            employeeId: "WIG-TEST-03",
            name: "Ahmad Fauzi",
            position: "Operational Supervisor",
            department: "General Affairs",
            birthDateFormatted: "08 Oktober",
            ageTurning: 32,
            daysUntil: 30,
            milestone: "H-30",
            statusName: null,
        },
    ];

    const timestamp = new Date().toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const textContent = `UJI COBA SISTEM EMAIL PENGINGAT ULANG TAHUN
PT Wijaya Inovasi Gemilang - HRIS System
==================================================

Konfigurasi koneksi SMTP berhasil diverifikasi.
Ini adalah email uji coba untuk memastikan bahwa notifikasi pengingat ulang tahun pegawai dapat terkirim dan terbaca dengan baik.

Simulasi Data Penerima Reminder:
${testItems.map((item) => `- ${item.name} (${item.department} - ${item.position})
  Tanggal Lahir: ${item.birthDateFormatted} (Usia ke-${item.ageTurning})
  Jadwal: ${item.daysUntil} hari lagi (${item.milestone})
  Status: ${item.statusName || "Belum Diproses"}`).join("\n\n")}

==================================================
Waktu Pengujian: ${timestamp} WIB
Email ini dikirimkan secara otomatis oleh Sistem HRIS WIG. Tidak memerlukan balasan.`;

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Uji Coba Pengingat Ulang Tahun Pegawai</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;-webkit-font-smoothing:antialiased;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    <div style="height:4px;background:#800020;"></div>
    <div style="padding:28px 24px;">
      <div style="border-bottom:1px solid #f1f5f9;padding-bottom:16px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:1px;color:#64748b;text-transform:uppercase;margin-bottom:4px;">
          PT Wijaya Inovasi Gemilang
        </div>
        <div style="font-size:18px;font-weight:700;color:#0f172a;">
          Uji Coba Pengingat Ulang Tahun Pegawai
        </div>
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:12px 16px;border-radius:6px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:600;color:#166534;margin-bottom:2px;">Konfigurasi SMTP Berfungsi Normal</div>
        <div style="font-size:12px;color:#15803d;line-height:1.5;">
          Email uji coba ini mengonfirmasi bahwa pengiriman notifikasi pengingat ulang tahun pegawai siap digunakan dan terkirim dengan baik.
        </div>
      </div>

      <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:8px;">
        Simulasi Format Data Reminder:
      </div>

      <div style="overflow-x:auto;margin-bottom:20px;border:1px solid #e2e8f0;border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#475569;">
              <th style="padding:10px 12px;font-weight:600;">Nama Pegawai</th>
              <th style="padding:10px 12px;font-weight:600;">Divisi / Jabatan</th>
              <th style="padding:10px 12px;font-weight:600;">Tgl Lahir</th>
              <th style="padding:10px 12px;font-weight:600;text-align:center;">Jadwal</th>
              <th style="padding:10px 12px;font-weight:600;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${testItems.map((item) => `
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:10px 12px;font-weight:600;color:#1e293b;">
                  ${item.name}
                  <div style="font-size:11px;color:#64748b;font-weight:normal;">Usia ke-${item.ageTurning}</div>
                </td>
                <td style="padding:10px 12px;color:#475569;font-size:12px;">${item.department} &bull; ${item.position}</td>
                <td style="padding:10px 12px;color:#800020;font-weight:600;font-size:12px;">${item.birthDateFormatted}</td>
                <td style="padding:10px 12px;text-align:center;">
                  <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f1f5f9;color:#334155;">
                    ${item.daysUntil} Hari Lagi (${item.milestone})
                  </span>
                </td>
                <td style="padding:10px 12px;">
                  ${item.statusName ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#e2e8f0;color:#334155;">${item.statusName}</span>` : '<span style="color:#94a3b8;font-size:12px;">Belum Diproses</span>'}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div style="border-top:1px solid #f1f5f9;padding-top:16px;font-size:11px;color:#94a3b8;line-height:1.5;">
        <div>Email uji coba dari Sistem HRIS PT Wijaya Inovasi Gemilang.</div>
        <div style="margin-top:2px;">Waktu pengujian: ${timestamp} WIB</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    try {
        const transporter = createTransporter();
        if (!transporter) {
            return { success: false, message: "Gagal membuat koneksi SMTP." };
        }

        await transporter.sendMail({
            from: SMTP_FROM,
            to: recipients.join(", "),
            subject: "Uji Coba Pengingat Ulang Tahun - WIG HRIS",
            text: textContent,
            html,
        });

        logger.info("[Email] Test email reminder berhasil dikirim", { recipients });
        return {
            success: true,
            message: `Email uji coba berhasil dikirim ke: ${recipients.join(", ")}`,
        };
    } catch (error) {
        logger.error("[Email] Gagal mengirim test email reminder", { recipients, error });
        return {
            success: false,
            message: error instanceof Error ? error.message : "Gagal mengirim email uji coba.",
        };
    }
}


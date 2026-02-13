import nodemailer from "nodemailer";

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
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
}

export async function sendPasswordEmail(
    email: string,
    name: string,
    password: string
): Promise<boolean> {
    const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
      <div style="text-align:center;margin-bottom:24px">
        <h2 style="margin:0;color:#1a1a2e;font-size:20px">WIG Attendance System</h2>
        <p style="margin:4px 0 0;color:#6b7280;font-size:13px">PT Wijaya Inovasi Gemilang</p>
      </div>
      <div style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:20px">
        <p style="margin:0 0 8px;color:#374151;font-size:14px">Halo <strong>${name}</strong>,</p>
        <p style="margin:0 0 16px;color:#6b7280;font-size:13px">Berikut adalah password akun Anda untuk login ke sistem absensi:</p>
        <div style="background:#1a1a2e;color:#fff;padding:16px;border-radius:8px;text-align:center;font-size:22px;letter-spacing:3px;font-weight:bold;font-family:monospace">
          ${password}
        </div>
      </div>
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin-bottom:16px">
        <p style="margin:0;color:#92400e;font-size:12px">⚠️ Segera ubah password Anda setelah login pertama melalui menu <strong>Pengaturan</strong>.</p>
      </div>
      <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center">Email ini dikirim secara otomatis. Jangan bagikan password Anda kepada siapapun.</p>
    </div>`;

    if (!isSmtpConfigured) {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📧 [EMAIL FALLBACK - SMTP not configured]");
        console.log(`   To:       ${email}`);
        console.log(`   Name:     ${name}`);
        console.log(`   Password: ${password}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        return true;
    }

    try {
        const transporter = createTransporter()!;
        await transporter.sendMail({
            from: SMTP_FROM,
            to: email,
            subject: "Password Akun WIG Attendance",
            html,
        });
        console.log(`[Email] Password sent to ${email}`);
        return true;
    } catch (error) {
        console.error("[Email] Failed to send:", error);
        return false;
    }
}

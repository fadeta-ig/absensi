import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapKondisi(k: string): "BAIK" | "KURANG_BAIK" | "RUSAK" {
    const lower = k.toLowerCase().trim();
    if (lower === "baik") return "BAIK";
    if (lower.includes("kurang")) return "KURANG_BAIK";
    return "RUSAK";
}

function mapPIC(pic: string): { holderType: string; assignedToName: string | null; status: string } {
    if (pic === "GA(General Affairs)") return { holderType: "GA_POOL", assignedToName: null, status: "AVAILABLE" };
    if (pic === "Ahmad Najib") return { holderType: "FORMER_EMPLOYEE", assignedToName: pic, status: "IN_USE" };
    if (pic.startsWith("Tim ")) return { holderType: "TEAM", assignedToName: pic, status: "IN_USE" };
    return { holderType: "EMPLOYEE", assignedToName: pic, status: "IN_USE" };
}

function getLevel(jabatan: string): string {
    const j = jabatan.toLowerCase();
    if (j.includes("chief executive officer")) return "CEO";
    if (j.includes("general manager")) return "GM";
    if (j.startsWith("manager") || j.includes("manager of")) return "MANAGER";
    if (j.includes("supervisor") || j.startsWith("lead ") || j === "lead hrga") return "SUPERVISOR";
    return "STAFF";
}

function parseExpiredDate(note: string): Date | null {
    const months: Record<string, number> = {
        January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
        July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
    };
    const [month, year] = note.trim().split(" ");
    const m = months[month];
    const y = parseInt(year);
    if (m !== undefined && !isNaN(y)) return new Date(y, m, 1);
    return null;
}

function toEmail(nick: string): string {
    return nick.toLowerCase().replace(/[^a-z0-9]/g, "") + "@wig.co.id";
}

/** Generate unique ID format: ID25 + 6 digit angka random (total 10 karakter) */
const _usedIds = new Set<string>();
function generateID25(): string {
    let id: string;
    do {
        const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
        id = `ID25${digits}`;
    } while (_usedIds.has(id));
    _usedIds.add(id);
    return id;
}

// ─── Data Karyawan (dari database_karyawan.json) ─────────────────────────────

const KARYAWAN = [
    { name: "Apt. Jose Amadeus Abdi A.L.P, S.Farm", nick: "Jose", jabatan: "Chief Executive Officer", dept: "Direksi", div: "C-Level" },
    { name: "Dinda Budiarti, S.M., CWM.", nick: "Dinda", jabatan: "Manager of Finance, Accounting, Tax & Invesment", dept: "Direksi", div: "Finance, Accounting, Invesment & Tax" },
    { name: "Rika Nidiawati, A.Md.PJK.", nick: "Rika", jabatan: "Finance, Accounting & Tax Staff", dept: "Finance, Accounting, Tax & Invesment", div: "Finance, Accounting, Invesment & Tax" },
    { name: "Tri Sapta Mahardika, CSBA.", nick: "Dika", jabatan: "Supervisor of Creative Marketing", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Serli Indriani, A.Md.PJK.", nick: "Serli", jabatan: "Warehouse Staff", dept: "Supply Chain Management", div: "Operation and Supply Chain Management" },
    { name: "Andhika Yogatama Yanuar", nick: "Andhi", jabatan: "Content Creator Staff", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Syahril Qudus Ibnu Ahmad, S.E., Ak., M.Acc., CFRM", nick: "Syahril", jabatan: "Supervisor of Finance, Accounting, Tax & Invesment", dept: "Finance, Accounting, Tax & Invesment", div: "Finance, Accounting, Invesment & Tax" },
    { name: "Wicaksono Aji Pamungkas, S.I.Kom., M.A., CSBA.", nick: "Panpan", jabatan: "Supervisor of Packaging Development", dept: "Packaging Development", div: "Operation and Supply Chain Management" },
    { name: "Ir. Anang Siswanto, ST.,MT.,IPM., ASEAN ENG., ASCA., ASCP, CSCM., CFDM., CPPIM., CIOMP., CRMP., CSBA., MMC., MBA.", nick: "Anang", jabatan: "General Manager", dept: "Operation", div: "Operation" },
    { name: "Endru Riski Hermansya", nick: "Endru", jabatan: "Warehouse Staff", dept: "Supply Chain Management", div: "Operation and Supply Chain Management" },
    { name: "Ricky Aditya Perdana, S.T.", nick: "Ricky", jabatan: "Purchasing Staff", dept: "Supply Chain Management", div: "Operation and Supply Chain Management" },
    { name: "Refo Ganggawasa Utomo", nick: "Refo", jabatan: "Content Creator Staff", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Aris Sudirman, S.T.", nick: "Aris", jabatan: "Teknisi & Operational Staff", dept: "Operation and Maintenance", div: "Operation and Supply Chain Management" },
    { name: "Dimas Bhranta Putera Adi, S.T., CIOMP., CSCM.", nick: "Dimas", jabatan: "Manager of Operation and Supply Chain Management", dept: "Operation", div: "Operation and Supply Chain Management" },
    { name: "Wahyu Agus Widadi", nick: "Agus", jabatan: "General Affair Staff", dept: "HRGA & IT", div: "Operation and Supply Chain Management" },
    { name: "A'isyah Qurota A'yun, S.Si", nick: "Ais", jabatan: "Lab Analyst Staff", dept: "Research, Quality & Development", div: "Operation and Supply Chain Management" },
    { name: "Fadeta Ilhan Gandhi, S.T.", nick: "Fadeta", jabatan: "IT Staff", dept: "HRGA & IT", div: "Operation and Supply Chain Management" },
    { name: "Ratri Yuliana, S.T.", nick: "Ratri", jabatan: "Purchasing Admin", dept: "Supply Chain Management", div: "Operation and Supply Chain Management" },
    { name: "Kania Gayatri, S.TP.", nick: "Kania", jabatan: "Quality & Regulatory Staff", dept: "Quality & Regulatory", div: "Operation and Supply Chain Management" },
    { name: "R. Ibnu Wicaksono Wibowo", nick: "El", jabatan: "Packaging Development Staff", dept: "Packaging Development", div: "Operation and Supply Chain Management" },
    { name: "Daffa Fakhuddin Arrozy, S.T.", nick: "Daffa", jabatan: "IT Staff", dept: "HRGA & IT", div: "Operation and Supply Chain Management" },
    { name: "Nuralim", nick: "Nuralim", jabatan: "Chief of Security", dept: "HRGA & IT", div: "Operation and Supply Chain Management" },
    { name: "Aryo Wicaksono, S.E.", nick: "Aryo", jabatan: "Market Research and Media Development Staff", dept: "Sales Marketing & Bussiness Development", div: "Sales Marketing & Bussiness Development" },
    { name: "Andy Anuari", nick: "Andy", jabatan: "General Affair Support", dept: "HRGA & IT", div: "Operation and Supply Chain Management" },
    { name: "Vina Hanifa, S.T.", nick: "Vina", jabatan: "Research and Development Specialist", dept: "Research & Development", div: "Operation and Supply Chain Management" },
    { name: "Apt. Febrian Nurrohman, S. Farm.", nick: "Febrian", jabatan: "Quality & Regulatory Supervisor", dept: "Quality & Regulatory", div: "Operation and Supply Chain Management" },
    { name: "Dwi Trisno Dini, S.Si", nick: "Dini", jabatan: "QC Staff", dept: "Quality & Regulatory", div: "Operation and Supply Chain Management" },
    { name: "Winarsih", nick: "Arsy", jabatan: "Resepsionis", dept: "HRGA & IT", div: "Operation and Supply Chain Management" },
    { name: "Tyas Arum Muninggar, S.Psi", nick: "Tyas", jabatan: "Human Resource Staff", dept: "HRGA & IT", div: "Operation and Supply Chain Management" },
    { name: "Ade Nuroktav Rahardi Putra, S.Sn.", nick: "Ade", jabatan: "Packaging Development Staff", dept: "Packaging Development", div: "Operation and Supply Chain Management" },
    { name: "Iqbida Denik Medianti", nick: "Denik", jabatan: "Sales & Reseller Agent Supervisor", dept: "Sales Marketing & Bussiness Development", div: "Sales Marketing & Bussiness Development" },
    { name: "Rafel Sutan Normansyah S.H", nick: "Rafel", jabatan: "Supply Planner", dept: "Warehouse", div: "Operation and Supply Chain Management" },
    { name: "Wisnu Wijayanto S.H", nick: "Wisnu", jabatan: "Foreman Warehouse", dept: "Warehouse", div: "Operation and Supply Chain Management" },
    { name: "Mufti Fatimah, S.M", nick: "Mufti", jabatan: "Admin Marketplace", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Jalu Adi Pratomo S.H", nick: "Jalu", jabatan: "Supervisor of HRGA", dept: "HRGA & IT", div: "Operation and Supply Chain Management" },
    { name: "Apt. Scholastica Dani Widyasari, S.Farm", nick: "Tika", jabatan: "Regulatory Staff", dept: "Quality & Regulatory", div: "Operation and Supply Chain Management" },
    { name: "Dea Ayu Permata Sari, A.Md.I.Kom", nick: "Dea", jabatan: "Affiliate Specialist", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Anisah Marlina Boru Regar, S.H", nick: "Anisah", jabatan: "Affiliate Specialist (Lead Function)", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Kharisma Nur Shafilla Andisyah Putri, S.I.Kom", nick: "Kharisma", jabatan: "Affiliate Specialist", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Noviani Nurul Alifah, S.Hum", nick: "Vey", jabatan: "Content Creator Staff", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Yuliani Anisa Maya Pradipta, S.T.P", nick: "Dipta", jabatan: "RnD Analisis", dept: "Research & Development", div: "Operation and Supply Chain Management" },
    { name: "Mochamad Zidane Zulkarnaen", nick: "Zidane", jabatan: "Host Live", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Detavia Putri Anggraeni", nick: "Detavia", jabatan: "Host Live", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Arnold Ega Pradipta, S.E", nick: "Ega", jabatan: "Staff Finance", dept: "Finance, Accounting, Tax & Invesment", div: "Finance, Accounting, Tax & Invesment" },
    { name: "Ida Rahmawati, S.Fill", nick: "Ida", jabatan: "Affiliate Specialist", dept: "Creative Marketing", div: "Sales Marketing & Bussiness Development" },
    { name: "Harfi Muthia Rahmi, S.Psi., M.Psi., Psikolog", nick: "Harfi", jabatan: "Lead HRGA", dept: "HRGA & IT", div: "HRGA & IT" },
    { name: "Arif Chandra Setiawan, ST", nick: "Arif", jabatan: "Warehouse Staff", dept: "Supply Chain Management", div: "Operation and Supply Chain Management" },
];

// ─── Asset Data HP (dari data_hp_pegawai.json) ───────────────────────────────

const DATA_HP = [
    { type: "Iphone 13 128 GB", pic: "Dinda Budiarti, S.M., CWM.", kondisi: "Baik", ket: "" },
    { type: "Iphone 13 128 GB", pic: "Ir. Anang Siswanto, ST.,MT.,IPM., ASEAN ENG., ASCA., ASCP, CSCM., CFDM., CPPIM., CIOMP., CRMP., CSBA., MMC., MBA.", kondisi: "Baik", ket: "" },
    { type: "Iphone 13 128 GB", pic: "GA(General Affairs)", kondisi: "Baik", ket: "" },
    { type: "Iphone 13 128 GB", pic: "Tri Sapta Mahardika, CSBA.", kondisi: "Baik", ket: "" },
    { type: "Iphone 11 64 GB", pic: "Dimas Bhranta Putera Adi, S.T., CIOMP., CSCM.", kondisi: "Baik", ket: "" },
    { type: "Iphone 11 64 GB", pic: "Iqbida Denik Medianti", kondisi: "Baik", ket: "" },
    { type: "Iphone 11 64 GB", pic: "Noviani Nurul Alifah, S.Hum", kondisi: "Baik", ket: "" },
    { type: "Samsung A54 6/128 GB", pic: "Kharisma Nur Shafilla Andisyah Putri, S.I.Kom", kondisi: "Baik", ket: "" },
    { type: "Redmi 15C New 8/256 GB", pic: "Dea Ayu Permata Sari, A.Md.I.Kom", kondisi: "Baik", ket: "" },
    { type: "Redmi 15C New 8/256 GB", pic: "Anisah Marlina Boru Regar, S.H", kondisi: "Baik", ket: "" },
    { type: "Samsung A05 4/128", pic: "Apt. Scholastica Dani Widyasari, S.Farm", kondisi: "Baik", ket: "" },
    { type: "Samsung A05 4/128 GB", pic: "Iqbida Denik Medianti", kondisi: "Baik", ket: "" },
    { type: "Samsung A05 4/128 GB", pic: "Syahril Qudus Ibnu Ahmad, S.E., Ak., M.Acc., CFRM", kondisi: "Baik", ket: "" },
    { type: "Samsung A05 4/128 GB", pic: "Rafel Sutan Normansyah S.H", kondisi: "Baik", ket: "" },
    { type: "Samsung A05 4/128 GB", pic: "Jalu Adi Pratomo S.H", kondisi: "Baik", ket: "" },
    { type: "Samsung A05 4/128 GB", pic: "Tim Warehouse", kondisi: "Baik", ket: "" },
    { type: "Samsung A05 4/128 GB", pic: "Harfi Muthia Rahmi, S.Psi., M.Psi., Psikolog", kondisi: "Baik", ket: "" },
    { type: "Samsung A05 4/128 GB", pic: "Rika Nidiawati, A.Md.PJK.", kondisi: "Baik", ket: "" },
    { type: "Samsung A05 4/128 GB", pic: "Vina Hanifa, S.T.", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S 4/128", pic: "Ratri Yuliana, S.T.", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S 4/128", pic: "Tyas Arum Muninggar, S.Psi", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S 4/128", pic: "Wahyu Agus Widadi", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S 4/128", pic: "Mufti Fatimah, S.M", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S 4/128 GB", pic: "Arnold Ega Pradipta, S.E", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S 4/128 GB", pic: "Aryo Wicaksono, S.E.", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S 4/128 GB", pic: "Wicaksono Aji Pamungkas, S.I.Kom., M.A., CSBA.", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S (Pink) 4/128 GB", pic: "Ida Rahmawati, S.Fill", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S (Pink) 4/128 GB", pic: "GA(General Affairs)", kondisi: "Baik", ket: "Ex Najib" },
    { type: "Realme C33 4/64 GB", pic: "Rika Nidiawati, A.Md.PJK.", kondisi: "Baik", ket: "" },
    { type: "Realme C33 4/64 GB", pic: "Dinda Budiarti, S.M., CWM.", kondisi: "Baik", ket: "" },
    { type: "Realme C33 4/64 GB", pic: "Dinda Budiarti, S.M., CWM.", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S 4/64 GB", pic: "Rika Nidiawati, A.Md.PJK.", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S 4/64 GB", pic: "GA(General Affairs)", kondisi: "Baik", ket: "" },
    { type: "Redmi 10C 4/64 GB", pic: "Ricky Aditya Perdana, S.T.", kondisi: "Baik", ket: "" },
    { type: "Samsung Galaxy A03S 4/64 GB", pic: "Tim Warehouse", kondisi: "Baik", ket: "" },
    { type: "Samsung Galaxy A03S 4/64 GB", pic: "Tim Herbanova", kondisi: "Baik", ket: "" },
    { type: "Samsung Galaxy A03S 4/64 GB", pic: "GA(General Affairs)", kondisi: "Baik", ket: "" },
    { type: "Samsung Galaxy A03 4/64 GB", pic: "GA(General Affairs)", kondisi: "Baik", ket: "" },
    { type: "Samsung M12 4/64 GB", pic: "Dinda Budiarti, S.M., CWM.", kondisi: "Baik", ket: "" },
    { type: "Samsung M12 4/64 GB", pic: "Dinda Budiarti, S.M., CWM.", kondisi: "Baik", ket: "" },
    { type: "Samsung A04S", pic: "Jalu Adi Pratomo S.H", kondisi: "Baik", ket: "Di Beli Pak Jalu Hasil Lelang Perusahaan" },
    { type: "Samsung A05", pic: "Ir. Anang Siswanto, ST.,MT.,IPM., ASEAN ENG., ASCA., ASCP, CSCM., CFDM., CPPIM., CIOMP., CRMP., CSBA., MMC., MBA.", kondisi: "Baik", ket: "Di Beli Pak Anang Hasil Lelang Perusahaan" },
    { type: "iPad Gen 9", pic: "Iqbida Denik Medianti", kondisi: "Baik", ket: "" },
    { type: "iPad Gen 9", pic: "Tim Creative", kondisi: "Baik", ket: "" },
    { type: "iPad Mini 6", pic: "Ir. Anang Siswanto, ST.,MT.,IPM., ASEAN ENG., ASCA., ASCP, CSCM., CFDM., CPPIM., CIOMP., CRMP., CSBA., MMC., MBA.", kondisi: "Baik", ket: "" },
    { type: "Redmi Pad SE", pic: "Tim Creative", kondisi: "Baik", ket: "" },
];

// ─── Asset Data Laptop (dari data_laptop_pegawai.json) ───────────────────────

const DATA_LAPTOP = [
    { type: "Acer Aspire 3 A314 AMD Athlon Silver 12/256 GB", pic: "Yuliani Anisa Maya Pradipta, S.T.P", kondisi: "Baik", ket: "" },
    { type: "Acer Aspire 3 AMD Athlon Silver 12/256 GB", pic: "Wisnu Wijayanto S.H", kondisi: "Baik", ket: "" },
    { type: "Asus Notebook A416JAO 12/256 GB", pic: "Ricky Aditya Perdana, S.T.", kondisi: "Baik", ket: "" },
    { type: "Acer Aspire 3 AMD Athlon Silver 8/256 GB", pic: "Rafel Sutan Normansyah S.H", kondisi: "Baik", ket: "" },
    { type: "Acer Aspire 3 Intel Core i3 4/256 GB", pic: "Winarsih", kondisi: "Baik", ket: "RAM Upgrade" },
    { type: "Acer Aspire 3 Intel Inside Celeron 8/256 GB", pic: "Serli Indriani, A.Md.PJK.", kondisi: "Baik", ket: "" },
    { type: "Asus Notebook 12/256 GB", pic: "Aryo Wicaksono, S.E.", kondisi: "Baik", ket: "" },
    { type: "Laptop Acer Aspire 3", pic: "Tim Creative", kondisi: "Kurang Baik", ket: "Baterai Rusak" },
    { type: "Laptop Asus Intel Core i3 12/256 GB", pic: "Anisah Marlina Boru Regar, S.H", kondisi: "Baik", ket: "" },
    { type: "Laptop Lenovo Ideapad Slim 1 AMD Athlon Silver RAM 8 GB SSD 256 GB", pic: "Vina Hanifa, S.T.", kondisi: "Baik", ket: "" },
    { type: "Laptop Lenovo Ideapad Slim 1 AMD Athlon Silver RAM 8 GB SSD 256 GB", pic: "Kania Gayatri, S.TP.", kondisi: "Baik", ket: "" },
    { type: "Laptop Lenovo Ideapad Slim 1 AMD Ryzen 3 8/256 GB", pic: "Tyas Arum Muninggar, S.Psi", kondisi: "Baik", ket: "" },
    { type: "Laptop Lenovo Thinkpad X13 Yoga TS RAM 16 GB SSD 512 GB", pic: "Rika Nidiawati, A.Md.PJK.", kondisi: "Baik", ket: "" },
    { type: "Laptop Lenovo Thinkpad X13 Yoga TS RAM 16 GB SSD 512 GB", pic: "Arnold Ega Pradipta, S.E", kondisi: "Baik", ket: "" },
    { type: "Laptop Lenovo Thinkpad L13 Yoga TS RAM 16 GB SSD 1TB", pic: "Jalu Adi Pratomo S.H", kondisi: "Baik", ket: "" },
    { type: "Laptop Lenovo Thinkpad L13 Yoga TS RAM 16 GB SSD 512 GB", pic: "Daffa Fakhuddin Arrozy, S.T.", kondisi: "Baik", ket: "" },
    { type: "Laptop Lenovo Thinkpad L13 Yoga TS RAM 16 GB SSD 512 GB", pic: "Fadeta Ilhan Gandhi, S.T.", kondisi: "Baik", ket: "" },
    { type: "Laptop Lenovo Ideapad Slim 1 AMD Ryzen 3 Silver RAM 8 GB SSD 256 GB", pic: "A'isyah Qurota A'yun, S.Si", kondisi: "Baik", ket: "" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 AMD Athlon Silver 8/256 GB", pic: "Ratri Yuliana, S.T.", kondisi: "Baik", ket: "Install Ulang" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 AMD Athlon Silver 8/256 GB", pic: "Syahril Qudus Ibnu Ahmad, S.E., Ak., M.Acc., CFRM", kondisi: "Baik", ket: "Install Ulang" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 AMD Athlon Silver 8/256 GB", pic: "Ricky Aditya Perdana, S.T.", kondisi: "Baik", ket: "Install Ulang" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 AMD Athlon Silver 8/256 GB", pic: "Dea Ayu Permata Sari, A.Md.I.Kom", kondisi: "Baik", ket: "" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 AMD Athlon Silver 8/256 GB", pic: "Aris Sudirman, S.T.", kondisi: "Baik", ket: "" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 AMD Athlon Silver 8/256 GB", pic: "Kharisma Nur Shafilla Andisyah Putri, S.I.Kom", kondisi: "Baik", ket: "Install Ulang" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 AMD Ryzen 3 8/256", pic: "Wahyu Agus Widadi", kondisi: "Baik", ket: "" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 AMD Ryzen 3 8/256 GB", pic: "GA(General Affairs)", kondisi: "Baik", ket: "Ex Najib" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 Intel Core i3 8/256 GB", pic: "Apt. Scholastica Dani Widyasari, S.Farm", kondisi: "Kurang Baik", ket: "Keyboard Error" },
    { type: "Lenovo Thinkpad T460 Intel Core i5 8/256 GB", pic: "GA(General Affairs)", kondisi: "Rusak", ket: "Baterai Rusak, LCD, Install Ulang, Trackpad Issue" },
    { type: "Lenovo Thinkpad X270 Intel Core i5 8/256 GB", pic: "GA(General Affairs)", kondisi: "Kurang Baik", ket: "Baterai Rusak" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 AMD Athlon Silver 8/256 GB", pic: "Ida Rahmawati, S.Fill", kondisi: "Baik", ket: "" },
    { type: "Macbook Air 2018 1.6GHz Dual-Core Intel Core i5 RAM 8GB SSD 128GB", pic: "Iqbida Denik Medianti", kondisi: "Baik", ket: "" },
    { type: "Macbook Air 2019 13\" Intel Core i5 RAM 8 GB SSD 256 GB", pic: "Dimas Bhranta Putera Adi, S.T., CIOMP., CSCM.", kondisi: "Kurang Baik", ket: "Batterai Issue, RAM On board (tidak bisa upgrade)" },
    { type: "Macbook Pro 2017 13\" Intel Core i5 RAM 8 GB SSD 256 GB", pic: "GA(General Affairs)", kondisi: "Kurang Baik", ket: "Ex Defana (Layar Glitch)" },
    { type: "Macbook Pro 2017 13\" Intel Core i5 RAM 8 GB SSD 256 GB", pic: "Harfi Muthia Rahmi, S.Psi., M.Psi., Psikolog", kondisi: "Kurang Baik", ket: "Batterai Issue" },
    { type: "Macbook Pro 2017 13\" Intel Core i5 RAM 8 GB SSD 256 GB", pic: "Apt. Febrian Nurrohman, S. Farm.", kondisi: "Kurang Baik", ket: "Batterai Issue" },
    { type: "Macbook Pro 2018 13\" Intel Core i5 RAM 8 GB SSD 256 GB", pic: "GA(General Affairs)", kondisi: "Rusak", ket: "Flexible Gate" },
    { type: "Macbook Pro 2019 TB Intel Core i7 16 GB 512 GB", pic: "Dinda Budiarti, S.M., CWM.", kondisi: "Baik", ket: "" },
    { type: "Macbook Pro TB 2019 13\" Intel Core i5 RAM 8 GB SSD 256 GB", pic: "Syahril Qudus Ibnu Ahmad, S.E., Ak., M.Acc., CFRM", kondisi: "Kurang Baik", ket: "Lemot" },
    { type: "Thinkpad T470 Intel Core i5 RAM 8 GB SSD 256 GB", pic: "GA(General Affairs)", kondisi: "Kurang Baik", ket: "Baterai Rusak" },
    { type: "Lenovo Ideapad Slim 1 14AMN7 AMD Athlon Silver 8/256 GB", pic: "GA(General Affairs)", kondisi: "Kurang Baik", ket: "Service" },
    { type: "Laptop Axioo RAM 4 GB SSD 256 GB", pic: "GA(General Affairs)", kondisi: "Kurang Baik", ket: "Not Recomended" },
    { type: "Macbook Air M1 2020 16/256 GB", pic: "Ir. Anang Siswanto, ST.,MT.,IPM., ASEAN ENG., ASCA., ASCP, CSCM., CFDM., CPPIM., CIOMP., CRMP., CSBA., MMC., MBA.", kondisi: "Baik", ket: "" },
];

// ─── Asset Data Nomor HP (dari data_nomor_hp_pegawai.json) ───────────────────

const DATA_NOMOR = [
    { pic: "Wahyu Agus Widadi", nomor: "0816334415", expired: "June 2026" },
    { pic: "Vina Hanifa, S.T.", nomor: "0816777096", expired: "June 2026" },
    { pic: "Dinda Budiarti, S.M., CWM.", nomor: "0816334418", expired: "June 2026" },
    { pic: "Dimas Bhranta Putera Adi, S.T., CIOMP., CSCM.", nomor: "0816777030", expired: "June 2026" },
    { pic: "Rafel Sutan Normansyah S.H", nomor: "0816777028", expired: "June 2026" },
    { pic: "Aryo Wicaksono, S.E.", nomor: "0816334425", expired: "June 2026" },
    { pic: "Apt. Jose Amadeus Abdi A.L.P, S.Farm", nomor: "0816777097", expired: "June 2026" },
    { pic: "GA(General Affairs)", nomor: "0816334413", expired: "June 2026" },
    { pic: "Ricky Aditya Perdana, S.T.", nomor: "0816334420", expired: "June 2026" },
    { pic: "Tyas Arum Muninggar, S.Psi", nomor: "0816334416", expired: "June 2026" },
    { pic: "Syahril Qudus Ibnu Ahmad, S.E., Ak., M.Acc., CFRM", nomor: "0816334419", expired: "June 2026" },
    { pic: "Tri Sapta Mahardika, CSBA.", nomor: "0816334412", expired: "June 2026" },
    { pic: "Wicaksono Aji Pamungkas, S.I.Kom., M.A., CSBA.", nomor: "0816334421", expired: "June 2026" },
    { pic: "Aryo Wicaksono, S.E.", nomor: "0816777031", expired: "June 2026" },
    { pic: "GA(General Affairs)", nomor: "0816334414", expired: "June 2026" },
    { pic: "Apt. Febrian Nurrohman, S. Farm.", nomor: "0816777687", expired: "August 2026" },
    { pic: "Apt. Scholastica Dani Widyasari, S.Farm", nomor: "0816777387", expired: "August 2026" },
    { pic: "Harfi Muthia Rahmi, S.Psi., M.Psi., Psikolog", nomor: "0816777537", expired: "August 2026" },
    { pic: "Jalu Adi Pratomo S.H", nomor: "0816777287", expired: "August 2026" },
    { pic: "Ahmad Najib", nomor: "0816777637", expired: "August 2026" },
    { pic: "Ir. Anang Siswanto, ST.,MT.,IPM., ASEAN ENG., ASCA., ASCP, CSCM., CFDM., CPPIM., CIOMP., CRMP., CSBA., MMC., MBA.", nomor: "08155787898", expired: "May 2026" },
    { pic: "GA(General Affairs)", nomor: "081575999878", expired: "May 2026" },
    { pic: "Iqbida Denik Medianti", nomor: "0816238687", expired: "April 2026" },
];

// ─── Main Seed Function ──────────────────────────────────────────────────────

async function main() {
    console.log("🌱 Seeding database (complete replacement)...");

    // ── 1. Clean slate (FK-safe order) ──────────────────────────────────────
    console.log("🗑  Clearing existing data...");
    const tryClear = async (fn: () => Promise<unknown>, name: string) => {
        try { await fn(); } catch { console.warn(`  ⚠ Skip clear ${name} (table may not exist or has constraints)`); }
    };

    await tryClear(() => prisma.assetHistory.deleteMany({}), "assetHistory");
    await tryClear(() => prisma.asset.deleteMany({}), "asset");
    await tryClear(() => prisma.pushSubscription.deleteMany({}), "pushSubscription");
    await tryClear(() => prisma.todoItem.deleteMany({}), "todoItem");
    await tryClear(() => prisma.newsItem.deleteMany({}), "newsItem");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).visit?.deleteMany({}), "visit");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).attendance?.deleteMany({}), "attendance");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).leaveRequest?.deleteMany({}), "leaveRequest");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).overtimeRequest?.deleteMany({}), "overtimeRequest");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).payslip?.deleteMany({}), "payslip");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).employeePayrollComponent?.deleteMany({}), "employeePayrollComponent");
    await tryClear(() => prisma.employee.deleteMany({}), "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).workShiftDay?.deleteMany({}), "workShiftDay");
    await tryClear(() => prisma.workShift.deleteMany({}), "workShift");
    await tryClear(() => prisma.department.deleteMany({}), "department");
    await tryClear(() => prisma.division.deleteMany({}), "division");
    await tryClear(() => prisma.position.deleteMany({}), "position");

    console.log("✅ Data lama berhasil dihapus");

    // ── 2. WorkShift ─────────────────────────────────────────────────────────
    const shift = await prisma.workShift.create({
        data: {
            id: "shift-001",
            name: "Shift Reguler (Senin–Sabtu)",
            isDefault: true,
            days: {
                create: [
                    { dayOfWeek: 0, startTime: "08:00", endTime: "17:00", isOff: true },
                    { dayOfWeek: 1, startTime: "08:00", endTime: "17:00", isOff: false },
                    { dayOfWeek: 2, startTime: "08:00", endTime: "17:00", isOff: false },
                    { dayOfWeek: 3, startTime: "08:00", endTime: "17:00", isOff: false },
                    { dayOfWeek: 4, startTime: "08:00", endTime: "17:00", isOff: false },
                    { dayOfWeek: 5, startTime: "08:00", endTime: "17:00", isOff: false },
                    { dayOfWeek: 6, startTime: "08:00", endTime: "13:00", isOff: false },
                ],
            },
        },
    });
    console.log(`✅ WorkShift: ${shift.name}`);

    // ── 3. Master Data (Division, Department, Position) ──────────────────────
    const divisionsSet = new Set<string>();
    const departmentsMap = new Map<string, string>(); // department -> division
    const positionsMap = new Map<string, string>(); // position -> level

    // Add admin data requirements
    divisionsSet.add("HRGA & IT");
    divisionsSet.add("Operation and Supply Chain Management");
    departmentsMap.set("HRGA & IT", "HRGA & IT");
    positionsMap.set("Manager", "MANAGER");
    positionsMap.set("Staff", "STAFF");

    for (const k of KARYAWAN) {
        divisionsSet.add(k.div);
        departmentsMap.set(k.dept, k.div);
        positionsMap.set(k.jabatan, getLevel(k.jabatan));
    }

    // Seed Divisions
    for (const div of divisionsSet) {
        await prisma.division.create({ data: { name: div, isActive: true } });
    }
    console.log(`✅ Divisions seeded: ${divisionsSet.size}`);

    // Seed Departments
    for (const [dept, div] of departmentsMap) {
        const divisionRecord = await prisma.division.findUnique({ where: { name: div } });
        if (divisionRecord) {
            await prisma.department.create({
                data: { name: dept, isActive: true, divisionId: divisionRecord.id },
            });
        }
    }
    console.log(`✅ Departments seeded: ${departmentsMap.size}`);

    // Seed Positions
    for (const [pos, level] of positionsMap) {
        await prisma.position.create({
            data: { name: pos, level, isActive: true },
        });
    }
    console.log(`✅ Positions seeded: ${positionsMap.size}`);

    // ── 4. Employees ─────────────────────────────────────────────────────────
    const hashedDefault = await bcrypt.hash("wig-absensi-default-pass", 10);
    const hashedAdmin = await bcrypt.hash("123", 10);

    // Admin HR (akun sistem — ID auto-generated)
    const adminHrId = generateID25();
    await prisma.employee.create({
        data: {
            id: "emp-001",
            employeeId: adminHrId,
            name: "Admin HR",
            email: "hr@wig.co.id",
            phone: "",
            department: "HRGA & IT",
            division: "HRGA & IT",
            position: "Manager",
            role: "hr",
            level: "MANAGER",
            password: hashedAdmin,
            joinDate: new Date("2024-01-01"),
            totalLeave: 12,
            usedLeave: 0,
            isActive: true,
            shiftId: "shift-001",
        },
    });

    // Admin GA (akun sistem — ID auto-generated)
    const adminGaId = generateID25();
    await prisma.employee.create({
        data: {
            id: "emp-002",
            employeeId: adminGaId,
            name: "Admin GA",
            email: "ga@wig.co.id",
            phone: "",
            department: "HRGA & IT",
            division: "Operation and Supply Chain Management",
            position: "Staff",
            role: "ga",
            level: "STAFF",
            password: hashedAdmin,
            joinDate: new Date("2024-01-01"),
            totalLeave: 12,
            usedLeave: 0,
            isActive: true,
            shiftId: "shift-001",
        },
    });

    // Karyawan nyata dari database_karyawan.json (ID auto-generated)
    const empNames: string[] = [];
    for (let i = 0; i < KARYAWAN.length; i++) {
        const k = KARYAWAN[i];
        const empId = generateID25();  // format: ID25 + 6 digit random
        const level = getLevel(k.jabatan);
        const email = toEmail(k.nick);

        await prisma.employee.create({
            data: {
                employeeId: empId,
                name: k.name,
                email,
                phone: "",
                department: k.dept,
                division: k.div,
                position: k.jabatan,
                role: "employee",
                level,
                password: hashedDefault,
                joinDate: new Date("2024-01-01"),
                totalLeave: 12,
                usedLeave: 0,
                isActive: true,
                shiftId: "shift-001",
            },
        });
        empNames.push(`${empId}: ${k.name}`);
    }

    console.log(`✅ Employees seeded: ${adminHrId} (Admin HR), ${adminGaId} (Admin GA), + ${KARYAWAN.length} karyawan aktif`);

    // ── 5. News ──────────────────────────────────────────────────────────────
    await prisma.newsItem.create({
        data: {
            id: "news-001",
            title: "Selamat Datang di WIG HRIS System",
            content: "Sistem absensi digital WIG kini telah aktif. Silakan gunakan fitur absensi dengan face recognition untuk pencatatan kehadiran yang lebih akurat.",
            category: "announcement",
            author: "Admin HR",
            isPinned: true,
        },
    });
    console.log("✅ News seeded");

    // ── 6. Assets: Handphone ─────────────────────────────────────────────────
    let hpCount = 0;
    for (let i = 0; i < DATA_HP.length; i++) {
        const item = DATA_HP[i];
        const { holderType, assignedToName, status } = mapPIC(item.pic);
        const kondisi = mapKondisi(item.kondisi);
        const assetCode = `HP-${String(i + 1).padStart(3, "0")}`;

        await prisma.asset.create({
            data: {
                assetCode,
                name: item.type,
                category: "HANDPHONE",
                kondisi: kondisi as never,
                status: status as never,
                holderType: holderType as never,
                assignedToName,
                assignedAt: assignedToName ? new Date("2024-01-01") : null,
                keterangan: item.ket || null,
            },
        });
        hpCount++;
    }
    console.log(`✅ Aset Handphone/Tablet: ${hpCount} item`);

    // ── 7. Assets: Laptop ────────────────────────────────────────────────────
    let ltCount = 0;
    for (let i = 0; i < DATA_LAPTOP.length; i++) {
        const item = DATA_LAPTOP[i];
        const { holderType, assignedToName, status } = mapPIC(item.pic);
        const kondisi = mapKondisi(item.kondisi);
        // MAINTENANCE jika kondisi RUSAK/KURANG_BAIK + di GA
        const finalStatus = holderType === "GA_POOL" && kondisi !== "BAIK" ? "MAINTENANCE" : status;
        const assetCode = `LT-${String(i + 1).padStart(3, "0")}`;

        await prisma.asset.create({
            data: {
                assetCode,
                name: item.type,
                category: "LAPTOP",
                kondisi: kondisi as never,
                status: finalStatus as never,
                holderType: holderType as never,
                assignedToName,
                assignedAt: assignedToName ? new Date("2024-01-01") : null,
                keterangan: item.ket || null,
            },
        });
        ltCount++;
    }
    console.log(`✅ Aset Laptop: ${ltCount} item`);

    // ── 8. Assets: Nomor HP ──────────────────────────────────────────────────
    let numCount = 0;
    for (let i = 0; i < DATA_NOMOR.length; i++) {
        const item = DATA_NOMOR[i];
        const { holderType, assignedToName, status } = mapPIC(item.pic);
        const assetCode = `NUM-${String(i + 1).padStart(3, "0")}`;
        const expiredDate = parseExpiredDate(item.expired);

        await prisma.asset.create({
            data: {
                assetCode,
                name: `Nomor Indosat ${item.nomor}`,
                category: "NOMOR_HP",
                kondisi: "BAIK",
                status: status as never,
                holderType: holderType as never,
                assignedToName,
                assignedAt: assignedToName ? new Date("2024-01-01") : null,
                nomorIndosat: item.nomor,
                expiredDate,
                keterangan: null,
            },
        });
        numCount++;
    }
    console.log(`✅ Aset Nomor Indosat: ${numCount} item`);

    const totalAssets = hpCount + ltCount + numCount;
    console.log(`\n🎉 Seeding complete!`);
    console.log(`   👥 Karyawan  : ${KARYAWAN.length + 2} (${KARYAWAN.length} aktif + 2 admin sistem)`);
    console.log(`   📦 Total Aset: ${totalAssets} (${hpCount} HP, ${ltCount} laptop, ${numCount} nomor)`);
}

main()
    .catch((e) => {
        console.error("❌ Seed error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

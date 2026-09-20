#!/usr/bin/env bash
# ==============================================================================
# Script Pemulihan & Manajemen Layanan Server VPS (Presensi & HRIS WIG)
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN}   🕊️ INITIATING SERVER RECOVERY & SERVICE STARTUP    ${NC}"
echo -e "${BLUE}======================================================${NC}"

# 1. CEK & AKTIFKAN DATABASE
echo -e "\n${YELLOW}[1/4] Memeriksa & Mengaktifkan Layanan Database...${NC}"
if systemctl is-active --quiet mariadb; then
    echo -e "  ✅ MariaDB sudah aktif."
elif systemctl is-active --quiet mysql; then
    echo -e "  ✅ MySQL sudah aktif."
else
    if systemctl list-unit-files | grep -q mariadb.service; then
        echo -e "  🔄 Menghidupkan service mariadb..."
        sudo systemctl start mariadb
        sudo systemctl enable mariadb
    elif systemctl list-unit-files | grep -q mysql.service; then
        echo -e "  🔄 Menghidupkan service mysql..."
        sudo systemctl start mysql
        sudo systemctl enable mysql
    else
        echo -e "  ⚠️ Database service tidak ditemukan via systemctl."
    fi
fi

# 2. CEK & AKTIFKAN NGINX (DENGAN PENGECEKAN PORT 80 & APACHE)
echo -e "\n${YELLOW}[2/4] Memeriksa & Mengaktifkan Web Server (Nginx)...${NC}"
# Matikan apache2 jika tidak sengaja aktif merebut port 80 pasca reboot
if systemctl is-active --quiet apache2; then
    echo -e "  ⚠️ Apache2 terdeteksi aktif dan memblokir port 80. Mematikan apache2..."
    sudo systemctl stop apache2
    sudo systemctl disable apache2
fi

# Test konfigurasi nginx
if sudo nginx -t > /dev/null 2>&1; then
    sudo systemctl restart nginx
    echo -e "  ✅ Nginx berhasil dihidupkan."
else
    echo -e "  ❌ Terdapat kesalahan konfigurasi Nginx. Menjalankan 'nginx -t':"
    sudo nginx -t || true
fi

# 3. AKTIFKAN PM2
echo -e "\n${YELLOW}[3/4] Memeriksa & Menghidupkan Node.js via PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo -e "  ❌ PM2 belum terpasang global. Jalankan: npm install -g pm2"
else
    pm2 resurrect || true
    APP_NAME="hris"
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        STATUS=$(pm2 jlist | grep -o "\"name\":\"$APP_NAME\"[^}]*" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        if [ "$STATUS" != "online" ]; then
            echo -e "  🔄 Restarting $APP_NAME..."
            pm2 restart "$APP_NAME"
        else
            echo -e "  ✅ Proses $APP_NAME sudah ONLINE."
        fi
    elif pm2 describe "absensi-wig" > /dev/null 2>&1; then
        echo -e "  🔄 Menemukan proses lama absensi-wig. Menghapus dan mengganti ke hris..."
        pm2 delete absensi-wig || true
        pm2 start ecosystem.config.js
    else
        echo -e "  🚀 Memulai proses $APP_NAME via ecosystem.config.js..."
        if [ -f "ecosystem.config.js" ]; then
            pm2 start ecosystem.config.js
        else
            pm2 start npm --name "$APP_NAME" -- run start:host
        fi
    fi
    pm2 save
fi

# 4. HEALTH CHECK
echo -e "\n${YELLOW}[4/4] Menjalankan Health Check Port 3000...${NC}"
sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "302" ]; then
    echo -e "  ✅ Aplikasi merespons (HTTP Status: ${GREEN}${HTTP_CODE}${NC})"
else
    echo -e "  ⚠️ HTTP Status lokal: ${HTTP_CODE}"
fi

echo -e "\n${BLUE}======================================================${NC}"
echo -e "${GREEN}   ✨ RINGKASAN STATUS PM2                            ${NC}"
echo -e "${BLUE}======================================================${NC}"
pm2 status

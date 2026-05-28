#!/bin/sh
#
# Скрипт для безопасной прошивки загрузчика (BL2 и FIP) на устройствах MediaTek MT798x
# Разработан специально для comfast_cf-wr632ax и аналогичных плат.
#

set -e

# Удобный вывод сообщений
info() {
    echo -e "\033[1;36m[ИНФО]\033[0m $1"
}

warn() {
    echo -e "\033[1;33m[ВНИМАНИЕ]\033[0m $1"
}

error() {
    echo -e "\033[1;31m[ОШИБКА]\033[0m $1"
    exit 1
}

success() {
    echo -e "\033[1;32m[УСПЕХ]\033[0m $1"
}

# Красивое приветствие
echo -e "\033[1;35m"
echo "  ========================================================"
echo "    Скрипт прошивки загрузчика LEBOOT для MediaTek MT798x "
echo "  ========================================================"
echo -e "\033[0m"

# Проверка, что скрипт запущен на самом роутере
if [ ! -f /proc/mtd ]; then
    error "Этот скрипт должен быть запущен непосредственно на роутере под управлением OpenWrt!"
fi

# Поиск разделов mtd в /proc/mtd
find_mtd_partition() {
    local name="$1"
    local dev=$(grep -i "\"$name\"" /proc/mtd | cut -d':' -f1)
    if [ -z "$dev" ]; then
        # Попробуем альтернативные имена (например, preloader вместо bl2)
        if [ "$name" = "bl2" ]; then
            dev=$(grep -i '"preloader"' /proc/mtd | cut -d':' -f1)
        fi
    fi
    echo "$dev"
}

# Определение MTD разделов
MTD_BL2=$(find_mtd_partition "bl2")
MTD_FIP=$(find_mtd_partition "fip")

# Вывод найденных разделов
if [ -n "$MTD_BL2" ]; then
    info "Найден раздел BL2 (Preloader): \033[1m$MTD_BL2\033[0m"
else
    warn "Раздел BL2 не найден в /proc/mtd! Возможно, это SPI-NOR устройство с фиксированной таблицей."
fi

if [ -n "$MTD_FIP" ]; then
    info "Найден раздел FIP (U-Boot): \033[1m$MTD_FIP\033[0m"
else
    error "Не удалось найти раздел FIP (U-Boot) в /proc/mtd! Прошивка невозможна."
fi

# Функция интерактивного выбора файлов
select_file() {
    local pattern="$1"
    local prompt="$2"
    local files=$(ls $pattern 2>/dev/null || true)
    
    if [ -z "$files" ]; then
        echo ""
        return 1
    fi
    
    # Если найден ровно один файл, автовыбор
    local count=$(echo "$files" | wc -w)
    if [ "$count" -eq 1 ]; then
        echo "$files"
        return 0
    fi
    
    warn "$prompt"
    local i=1
    for f in $files; do
        echo "  [$i] $f"
        i=$((i + 1))
    done
    
    echo -n "Выберите номер (1-$((i-1))): "
    read choice < /dev/tty
    
    local selected=$(echo "$files" | cut -d' ' -f"$choice")
    if [ -z "$selected" ]; then
        error "Неверный выбор файла!"
    fi
    echo "$selected"
}

# Выбор файлов прошивки
BL2_FILE=""
if [ -n "$MTD_BL2" ]; then
    BL2_FILE=$(select_file "*bl2*.bin" "Найдены следующие файлы для BL2:")
    if [ -z "$BL2_FILE" ]; then
        warn "Файл BL2 (*bl2*.bin) не найден в текущей папке. Будет прошит только FIP."
    else
        info "Выбран файл BL2: \033[1m$BL2_FILE\033[0m"
    fi
fi

FIP_FILE=$(select_file "*fip*.bin" "Найдены следующие файлы для FIP:")
if [ -z "$FIP_FILE" ]; then
    FIP_FILE=$(select_file "*u-boot*.bin" "Найдены следующие файлы для U-Boot:")
fi

if [ -z "$FIP_FILE" ]; then
    error "Не найден файл FIP/U-Boot (*fip*.bin или *u-boot*.bin) в текущей папке!"
else
    info "Выбран файл FIP: \033[1m$FIP_FILE\033[0m"
fi

# Подтверждение от пользователя
echo ""
warn "ВНИМАНИЕ! Прошивка неподходящего загрузчика может превратить роутер в кирпич."
warn "Перед продолжением настоятельно рекомендуется сделать резервную копию текущих разделов!"
echo -n "Вы абсолютно уверены, что хотите продолжить? (y/N): "
read confirm < /dev/tty
case "$confirm" in
    y|Y|yes|YES)
        ;;
    *)
        error "Операция отменена пользователем."
        ;;
esac

# 1. Прошивка BL2 (если применимо)
if [ -n "$MTD_BL2" ] && [ -n "$BL2_FILE" ]; then
    info "Вычисляем контрольную сумму BL2..."
    md5sum "$BL2_FILE"
    
    info "Стираем и записываем BL2 в \033[1m$MTD_BL2\033[0m..."
    mtd write "$BL2_FILE" "$MTD_BL2"
    success "Раздел BL2 успешно прошит!"
fi

# 2. Прошивка FIP
info "Вычисляем контрольную сумму FIP..."
md5sum "$FIP_FILE"

info "Стираем и записываем FIP в \033[1m$MTD_FIP\033[0m..."
mtd write "$FIP_FILE" "$MTD_FIP"
success "Раздел FIP (U-Boot) успешно прошит!"

# 3. Очистка UBI (для NAND устройств)
MTD_UBI=$(find_mtd_partition "ubi")
if [ -n "$MTD_UBI" ]; then
    echo ""
    info "Обнаружен раздел UBI (NAND flash)."
    warn "Для чистой установки новой прошивки рекомендуется стереть раздел UBI."
    echo -n "Хотите очистить раздел UBI сейчас? (y/N): "
    read erase_ubi < /dev/tty
    case "$erase_ubi" in
        y|Y|yes|YES)
            info "Стираем раздел UBI ($MTD_UBI)..."
            mtd erase "$MTD_UBI"
            success "Раздел UBI успешно очищен!"
            ;;
        *)
            info "Стирание раздела UBI пропущено."
            ;;
    esac
fi

echo ""
success "========================================================"
success "   ПРОШИВКА ЗАВЕРШЕНА УСПЕШНО!                          "
success "   Вы можете безопасно перезагрузить устройство.        "
success "========================================================"
echo ""

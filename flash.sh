#!/bin/sh
#
# Скрипт для безопасного обновления загрузчика (FIP / U-Boot) на устройствах MediaTek MT798x
# Разработан специально для comfast_cf-wr632ax и аналогичных плат.
# Автоматически загружает последнюю версию сборки прямо с GitHub!
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

# --- СНЯТИЕ ЗАЩИТЫ ОТ ЗАПИСИ В САМОМ НАЧАЛЕ ---
info "Устанавливаем kmod-mtd-rw..."
if command -v apk >/dev/null 2>&1; then
    apk update || true
    apk add kmod-mtd-rw || true
elif command -v opkg >/dev/null 2>&1; then
    opkg update || true
    opkg install kmod-mtd-rw || true
fi

info "Загружаем модуль разблокировки разделов (mtd-rw)..."
insmod mtd-rw i_want_a_brick=1 2>/dev/null || \
insmod mtd_rw i_want_a_brick=1 2>/dev/null || \
insmod "/lib/modules/$(uname -r)/mtd-rw.ko" i_want_a_brick=1 2>/dev/null || \
insmod "/lib/modules/$(uname -r)/mtd_rw.ko" i_want_a_brick=1 2>/dev/null || \
modprobe mtd-rw i_want_a_brick=1 2>/dev/null || \
modprobe mtd_rw i_want_a_brick=1 2>/dev/null || true

if lsmod | grep -qE "mtd_rw|mtd-rw"; then
    success "Драйвер разблокировки разделов (mtd-rw) успешно загружен!"
else
    warn "Не удалось загрузить mtd-rw. При ошибке записи выполните вручную:"
    if command -v apk >/dev/null 2>&1; then
        echo -e "  \033[1;32mapk update && apk add kmod-mtd-rw && insmod mtd-rw i_want_a_brick=1\033[0m"
    else
        echo -e "  \033[1;32mopkg update && opkg install kmod-mtd-rw && insmod mtd-rw i_want_a_brick=1\033[0m"
    fi
fi
# ------------------------------------------------------

# Поиск разделов mtd в /proc/mtd (возвращает mtdX)
find_mtd_partition() {
    local name="$1"
    local dev=$(grep -i "\"$name\"" /proc/mtd | cut -d':' -f1)
    echo "$dev"
}

# Нахождение оригинального имени раздела в /proc/mtd (возвращает FIP или fip с сохранением регистра)
find_mtd_partition_name() {
    local name="$1"
    local label=$(grep -i "\"$name\"" /proc/mtd | cut -d'"' -f2)
    echo "$label"
}

# Определение MTD раздела FIP
MTD_FIP=$(find_mtd_partition "fip")
MTD_FIP_NAME=$(find_mtd_partition_name "fip")

if [ -n "$MTD_FIP" ] && [ -n "$MTD_FIP_NAME" ]; then
    info "Найден раздел загрузчика: \033[1m$MTD_FIP_NAME\033[0m ($MTD_FIP)"
else
    error "Не удалось найти раздел FIP (U-Boot) в /proc/mtd! Прошивка невозможна."
fi

# Интерактивное скачивание с GitHub
echo ""
info "Хотите загрузить последнюю версию загрузчика напрямую из GitHub Releases?"
echo -n "Скачать свежую сборку? (y/N): "
read dl_confirm < /dev/tty
case "$dl_confirm" in
    y|Y|yes|YES)
        info "Проверяем подключение к интернету и запрашиваем список релизов..."
        
        # Получаем JSON последнего релиза
        GITHUB_API="https://api.github.com/repos/DarkAssassinUA/LEBOOT/releases/latest"
        json=""
        if command -v curl >/dev/null 2>&1; then
            json=$(curl -s -L "$GITHUB_API")
        else
            json=$(wget -qO- --no-check-certificate "$GITHUB_API" || true)
        fi
        
        if [ -z "$json" ] || echo "$json" | grep -q "message.*Not Found"; then
            error "Не удалось получить список релизов с GitHub. Проверьте настройки сети на роутере."
        fi
        
        # Фильтруем ссылки: новый формат LEBOOT-vX.Y-DATE.fip
        urls=$(echo "$json" | grep -oE 'https://github.com/[^"]+' | grep -iE '\.fip$' | grep -i 'LEBOOT' || true)

        if [ -z "$urls" ]; then
            # Фолбек: старый формат *.bin с cf-wr632ax
            urls=$(echo "$json" | grep -oE 'https://github.com/[^"]+' | grep -E '\.(bin|fip)$' | grep -i 'cf-wr632ax' || true)
        fi

        if [ -z "$urls" ]; then
            # Последний фолбек: любой .fip или .bin файл в релизе
            urls=$(echo "$json" | grep -oE 'https://github.com/[^"]+' | grep -E '\.(bin|fip)$' || true)
        fi

        if [ -z "$urls" ]; then
            error "Не найдены файлы прошивки (.fip/.bin) в последнем релизе GitHub!"
        fi
        
        info "Найдены подходящие файлы для скачивания:"
        for url in $urls; do
            filename=$(basename "$url")
            echo "  - $filename"
        done
        
        # Скачиваем файлы
        for url in $urls; do
            filename=$(basename "$url")
            info "Скачиваем \033[1m$filename\033[0m..."
            if command -v curl >/dev/null 2>&1; then
                curl -L -o "$filename" "$url"
            else
                wget -O "$filename" --no-check-certificate "$url"
            fi
            success "Файл $filename успешно загружен!"
        done
        ;;
    *)
        info "Используем уже имеющиеся локальные файлы в текущей директории."
        ;;
esac

# Функция интерактивного выбора файлов
select_file() {
    local pattern="$1"
    local prompt="$2"
    local files=$(ls $pattern 2>/dev/null || true)
    
    if [ -z "$files" ]; then
        echo ""
        return 1
    fi
    
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
    
    local selected=$(echo $files | cut -d' ' -f"$choice")
    if [ -z "$selected" ]; then
        error "Неверный выбор файла!"
    fi
    echo "$selected"
}

# Выбор файла прошивки FIP: новый формат LEBOOT-*.fip, затем фолбеки
FIP_FILE=$(select_file "LEBOOT-*.fip" "Найдены следующие файлы LEBOOT FIP:")
if [ -z "$FIP_FILE" ]; then
    FIP_FILE=$(select_file "*.fip" "Найдены следующие .fip файлы:")
fi
if [ -z "$FIP_FILE" ]; then
    FIP_FILE=$(select_file "*fip*.bin" "Найдены следующие файлы для FIP:")
fi
if [ -z "$FIP_FILE" ]; then
    FIP_FILE=$(select_file "*u-boot*.bin" "Найдены следующие файлы для U-Boot:")
fi

if [ -z "$FIP_FILE" ]; then
    error "Не найден файл прошивки (LEBOOT-*.fip, *.fip, *fip*.bin) в текущей папке!"
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

# Прошивка FIP
info "Вычисляем контрольную сумму FIP..."
md5sum "$FIP_FILE"

info "Записываем FIP в раздел \033[1m$MTD_FIP_NAME\033[0m..."
mtd write "$FIP_FILE" "$MTD_FIP_NAME"
success "Раздел FIP (U-Boot) успешно прошит!"

echo ""
success "========================================================"
success "   ПРОШИВКА ЗАВЕРШЕНА УСПЕШНО!                          "
success "   Вы можете безопасно перезагрузить устройство.        "
success "========================================================"
echo ""

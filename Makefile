# SPDX-License-Identifier: GPL-2.0
#
# Copyright (C) 2026 Yuzhii0718
#
# All rights reserved.
#
# This file is part of the project bl-mt798x-dhcpd
# You may not use, copy, modify or distribute this file except in compliance with the license agreement.
#
# Quick Build Scripts
#

.DEFAULT_GOAL := build
SHELL := /bin/bash

CONFIG_FILE ?= .config
-include $(CONFIG_FILE)

MENUCONFIG_UBOOT_DIR ?= uboot-mtk-20250711

strip_quotes = $(subst ",,$(1))
config_bool = $(shell if grep -q '^$(1)=y$$' '$(CONFIG_FILE)' 2>/dev/null; then echo y; elif grep -q '^# $(1) is not set$$' '$(CONFIG_FILE)' 2>/dev/null; then echo n; else echo $(2); fi)

ifeq ($(origin VERSION), undefined)
  ifeq ($(strip $(CONFIG_VERSION_SP1)),y)
    VERSION := SP1
  else ifeq ($(strip $(CONFIG_VERSION_SP2)),y)
    VERSION := SP2
  else
    VERSION := 2025
  endif
endif

ifeq ($(origin VARIANT), undefined)
  ifeq ($(strip $(CONFIG_VARIANT_UBOOTMOD)),y)
    VARIANT := ubootmod
  else ifeq ($(strip $(CONFIG_VARIANT_NONMBM)),y)
    VARIANT := nonmbm
  else ifeq ($(strip $(CONFIG_VARIANT_OPENWRT)),y)
    VARIANT := openwrt
  else
    VARIANT := default
  endif
endif

ifeq ($(origin FSTHEME), undefined)
  ifeq ($(strip $(CONFIG_FSTHEME_GL)),y)
    FSTHEME := gl
  else ifeq ($(strip $(CONFIG_FSTHEME_MTK)),y)
    FSTHEME := mtk
  else
    FSTHEME := bootstrap
  endif
endif

# Collect selected boards from .config (BOARD_*=y)
# Deferred to recipe time via EVAL_BOARDS to avoid recursive $(MAKE) at parse time.
# If BUILD_ALL_BOARDS=y, discover all boards from configs directories.
# Otherwise, collect individual BOARD_*=y selections and resolve their display names.
ifeq ($(origin BOARDS), undefined)
  ifeq ($(origin BOARD),command line)
    # BOARD passed on command line takes priority
    BOARDS := $(BOARD)
    EVAL_BOARDS := 0
  else ifeq ($(call config_bool,CONFIG_BUILD_ALL_BOARDS,n),y)
    EVAL_BOARDS := 1
  else
    EVAL_BOARDS := 1
    BOARDS := $(shell \
      if [ -f '$(CONFIG_FILE)' ] && [ -f 'boards.kconfig' ]; then \
        for sym in $$(grep '^CONFIG_BOARD_[A-Z0-9_]*=y$$' '$(CONFIG_FILE)' | sed 's/=y$$//'); do \
          cfg_name=$${sym#CONFIG_}; \
          awk "/^config $$cfg_name\$$/{found=1; next} found && /bool /{gsub(/\"/,\"\",\$$2); print \$$2; exit}" boards.kconfig; \
        done; \
      fi)
  endif
else
  EVAL_BOARDS := 0
endif
# For backward compatibility, set BOARD to the first selected board
BOARD := $(firstword $(BOARDS))
ifeq ($(origin ATFCFG_DIR), undefined)
  ATFCFG_DIR := $(if $(strip $(CONFIG_ATFCFG_DIR)),$(call strip_quotes,$(CONFIG_ATFCFG_DIR)),mt798x_atf)
endif
ifeq ($(origin CFG_SUBDIR), undefined)
  CFG_SUBDIR := $(call strip_quotes,$(CONFIG_CFG_SUBDIR))
endif
ifeq ($(origin OUTPUT_DIR), undefined)
  OUTPUT_DIR := $(if $(strip $(CONFIG_OUTPUT_DIR)),$(call strip_quotes,$(CONFIG_OUTPUT_DIR)),output_bl2)
endif
ifeq ($(origin ATF_DIR), undefined)
  ATF_DIR := $(call strip_quotes,$(CONFIG_ATF_DIR))
endif
ifeq ($(origin UBOOT_DIR), undefined)
  UBOOT_DIR := $(call strip_quotes,$(CONFIG_UBOOT_DIR))
endif
ifeq ($(origin TOOLCHAIN), undefined)
  TOOLCHAIN := $(call strip_quotes,$(CONFIG_TOOLCHAIN))
endif

ifeq ($(origin MULTI_LAYOUT), undefined)
  MULTI_LAYOUT := $(if $(filter y,$(call config_bool,CONFIG_MULTI_LAYOUT,y)),1,0)
endif
ifeq ($(origin FIXED_MTDPARTS), undefined)
  FIXED_MTDPARTS := $(if $(filter y,$(call config_bool,CONFIG_FIXED_MTDPARTS,y)),1,0)
endif
ifeq ($(origin SIMG), undefined)
  SIMG := $(if $(filter y,$(call config_bool,CONFIG_SIMG,n)),1,0)
endif
ifeq ($(origin COPY_BL2), undefined)
  COPY_BL2 := $(if $(filter y,$(call config_bool,CONFIG_COPY_BL2,y)),1,0)
endif
ifeq ($(origin SILENT), undefined)
  SILENT := $(if $(filter y,$(call config_bool,CONFIG_SILENT,y)),Y,N)
endif
ifeq ($(origin BUILD_FIP), undefined)
	BUILD_FIP := $(call config_bool,CONFIG_BUILD_FIP,y)
endif
ifeq ($(origin BUILD_ATF), undefined)
	BUILD_ATF := $(call config_bool,CONFIG_BUILD_ATF,n)
endif
ifeq ($(origin BUILD_GPT), undefined)
	BUILD_GPT := $(call config_bool,CONFIG_BUILD_GPT,n)
endif
ifeq ($(origin SHOW), undefined)
  SHOW := $(if $(filter y,$(call config_bool,CONFIG_SHOW,n)),1,0)
endif
ifeq ($(origin DRAW), undefined)
  DRAW := $(if $(strip $(CONFIG_DRAW_MODE)),$(call strip_quotes,$(CONFIG_DRAW_MODE)),0)
endif
ifeq ($(origin SDMMC), undefined)
  SDMMC := $(if $(filter y,$(call config_bool,CONFIG_SDMMC,n)),1,0)
endif
ifeq ($(origin BUILD_LOG), undefined)
  BUILD_LOG := $(call config_bool,CONFIG_BUILD_LOG,n)
endif

.PHONY: all build boards board-configs gen-board-kconfig menuconfig defconfig atf gpt clean help

build:
	@set -euo pipefail; \
	is_enabled() { case "$$1" in y|Y|1|yes|YES|true|TRUE) return 0 ;; *) return 1 ;; esac; }; \
	run_fip=0; run_atf=0; run_gpt=0; \
	if is_enabled "$(BUILD_FIP)"; then run_fip=1; fi; \
	if is_enabled "$(BUILD_ATF)"; then run_atf=1; fi; \
	if is_enabled "$(BUILD_GPT)"; then run_gpt=1; fi; \
	if [[ "$$run_fip" -eq 0 && "$$run_atf" -eq 0 && "$$run_gpt" -eq 0 ]]; then \
		echo "Error: no build action enabled. Use make menuconfig and enable BUILD_FIP/BUILD_ATF/BUILD_GPT." >&2; \
		exit 1; \
	fi; \
	if [[ "$$run_fip" -eq 1 ]]; then \
		boards="$(BOARDS)"; \
		if [[ "$(EVAL_BOARDS)" == "1" && -z "$$boards" ]]; then \
			case "$(VERSION)" in \
				2025) ATF_DIR_TMP="atf-20250711"; UBOOT_DIR_TMP="uboot-mtk-20250711" ;; \
				SP1|sp1) ATF_DIR_TMP="atf-20240117-bacca82a8"; UBOOT_DIR_TMP="uboot-mtk-20250711" ;; \
				SP2|sp2) ATF_DIR_TMP="atf-20260123"; UBOOT_DIR_TMP="uboot-mtk-20250711" ;; \
				*) echo "Error: unsupported VERSION='$(VERSION)'." >&2; exit 1 ;; \
			esac; \
			atf_list=$$(mktemp); uboot_list=$$(mktemp); \
			trap 'rm -f "$$atf_list" "$$uboot_list"' EXIT; \
			find -L "$$ATF_DIR_TMP/configs" -maxdepth 1 -type f -name '*_defconfig' -printf '%f\n' | sed 's/_defconfig$$//' | sort -u > "$$atf_list"; \
			find -L "$$UBOOT_DIR_TMP/configs" -maxdepth 1 -type f -name '*_defconfig' -printf '%f\n' | sed 's/_defconfig$$//' | sort -u > "$$uboot_list"; \
			boards=$$(comm -12 "$$atf_list" "$$uboot_list" | sed 's/^[^_]*_//'); \
		fi; \
		if [[ -z "$$boards" ]]; then \
			echo "Error: no BOARD selected. Run 'make menuconfig' and select boards, or pass BOARD=<board>." >&2; \
			exit 1; \
		fi; \
		build_one_board() { \
			local board="$$1"; \
			mkdir -p output; \
			echo "----------------------------------------------------------------------"; \
			echo "Building BOARD=$$board (VERSION=$(VERSION), VARIANT=$(VARIANT))"; \
			if [[ "$(BUILD_LOG)" =~ ^[yY1] ]]; then \
				local log_file="output/build-$${board}-$(VERSION)-$(VARIANT).log"; \
				echo "Log: $$log_file"; \
				env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS \
				BOARD="$$board" VERSION="$(VERSION)" VARIANT="$(VARIANT)" FSTHEME="$(FSTHEME)" \
				MULTI_LAYOUT="$(MULTI_LAYOUT)" FIXED_MTDPARTS="$(FIXED_MTDPARTS)" SIMG="$(SIMG)" \
				COPY_BL2="$(COPY_BL2)" SILENT="$(SILENT)" ./build.sh 2>&1 | tee "$$log_file"; \
			else \
				env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS \
				BOARD="$$board" VERSION="$(VERSION)" VARIANT="$(VARIANT)" FSTHEME="$(FSTHEME)" \
				MULTI_LAYOUT="$(MULTI_LAYOUT)" FIXED_MTDPARTS="$(FIXED_MTDPARTS)" SIMG="$(SIMG)" \
				COPY_BL2="$(COPY_BL2)" SILENT="$(SILENT)" ./build.sh; \
			fi; \
		}; \
		success_count=0; \
		fail_count=0; \
		total_count=0; \
		for board in $$boards; do \
			total_count=$$((total_count + 1)); \
		done; \
		index=0; \
		for board in $$boards; do \
			index=$$((index + 1)); \
			echo "[$$index/$$total_count] $$board"; \
			if build_one_board "$$board"; then \
				success_count=$$((success_count + 1)); \
			else \
				fail_count=$$((fail_count + 1)); \
				echo "Build failed for BOARD=$$board, continuing..." >&2; \
			fi; \
		done; \
		echo "----------------------------------------------------------------------"; \
		echo "Build summary: success=$$success_count, failed=$$fail_count, total=$$total_count"; \
		if [[ "$$fail_count" -gt 0 ]]; then \
			exit 1; \
		fi; \
	fi; \
	if [[ "$$run_atf" -eq 1 ]]; then \
		printf '%s\n' "env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS ATF_DIR=\"$(ATF_DIR)\" VERSION=\"$(VERSION)\" VARIANT=\"$(VARIANT)\" ATFCFG_DIR=\"$(ATFCFG_DIR)\" CFG_SUBDIR=\"$(CFG_SUBDIR)\" OUTPUT_DIR=\"$(OUTPUT_DIR)\" TOOLCHAIN=\"$(TOOLCHAIN)\" ./compile_atf.sh"; \
		env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS \
		ATF_DIR="$(ATF_DIR)" VERSION="$(VERSION)" VARIANT="$(VARIANT)" \
		ATFCFG_DIR="$(ATFCFG_DIR)" CFG_SUBDIR="$(CFG_SUBDIR)" OUTPUT_DIR="$(OUTPUT_DIR)" \
		TOOLCHAIN="$(TOOLCHAIN)" ./compile_atf.sh; \
	fi; \
	if [[ "$$run_gpt" -eq 1 ]]; then \
		printf '%s\n' "env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS VERSION=\"$(VERSION)\" SHOW=\"$(SHOW)\" DRAW=\"$(DRAW)\" SDMMC=\"$(SDMMC)\" ./generate_gpt.sh"; \
		env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS \
		VERSION="$(VERSION)" SHOW="$(SHOW)" DRAW="$(DRAW)" SDMMC="$(SDMMC)" ./generate_gpt.sh; \
	fi

menuconfig:
	@set -euo pipefail; \
	if [ ! -f "$(CURDIR)/boards.kconfig" ]; then \
		$(MAKE) --no-print-directory gen-board-kconfig; \
	fi; \
	ln -sf "$(CURDIR)/boards.kconfig" "$(MENUCONFIG_UBOOT_DIR)/boards.kconfig"; \
	printf '%s\n' "env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS KBUILD_KCONFIG=\"$(CURDIR)/Kconfig\" KCONFIG_CONFIG=\"$(CURDIR)/$(CONFIG_FILE)\" make -C \"$(MENUCONFIG_UBOOT_DIR)\" menuconfig"; \
	env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS \
	KBUILD_KCONFIG="$(CURDIR)/Kconfig" \
	KCONFIG_CONFIG="$(CURDIR)/$(CONFIG_FILE)" \
	$(MAKE) -C "$(MENUCONFIG_UBOOT_DIR)" menuconfig; \
	rm -f "$(MENUCONFIG_UBOOT_DIR)/boards.kconfig"

defconfig:
	@set -euo pipefail; \
	if [ ! -f "$(MENUCONFIG_UBOOT_DIR)/scripts/kconfig/conf" ]; then \
		echo "Building kconfig conf tool..."; \
		$(MAKE) -C "$(MENUCONFIG_UBOOT_DIR)" scripts/kconfig/conf; \
	fi; \
	if [ ! -f "$(CURDIR)/boards.kconfig" ]; then \
		$(MAKE) --no-print-directory gen-board-kconfig; \
	fi; \
	ln -sf "$(CURDIR)/boards.kconfig" "$(MENUCONFIG_UBOOT_DIR)/boards.kconfig"; \
	if [ -f "$(CURDIR)/$(CONFIG_FILE)" ]; then \
		echo "Filling in missing defaults from existing $(CONFIG_FILE)..."; \
		KBUILD_KCONFIG="$(CURDIR)/Kconfig" KCONFIG_CONFIG="$(CURDIR)/$(CONFIG_FILE)" \
			"$(MENUCONFIG_UBOOT_DIR)/scripts/kconfig/conf" --olddefconfig "$(CURDIR)/Kconfig"; \
	else \
		echo "Generating default $(CONFIG_FILE)..."; \
		KBUILD_KCONFIG="$(CURDIR)/Kconfig" KCONFIG_CONFIG="$(CURDIR)/$(CONFIG_FILE)" \
			"$(MENUCONFIG_UBOOT_DIR)/scripts/kconfig/conf" --alldefconfig "$(CURDIR)/Kconfig"; \
	fi; \
	rm -f "$(MENUCONFIG_UBOOT_DIR)/boards.kconfig"

all:
	@set -euo pipefail; \
	case "$(VERSION)" in \
		2025) ATF_DIR="atf-20250711"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		SP1|sp1) ATF_DIR="atf-20240117-bacca82a8"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		SP2|sp2) ATF_DIR="atf-20260123"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		*) echo "Error: unsupported VERSION='$(VERSION)'." >&2; echo "Supported: 2025/SP1/SP2" >&2; exit 1 ;; \
	esac; \
	collect_board_configs() { \
		local atf_cfg_dir="$$ATF_DIR/configs"; \
		local uboot_cfg_dir="$$UBOOT_DIR/configs"; \
		local atf_list uboot_list; \
		if [[ ! -d "$$atf_cfg_dir" || ! -d "$$uboot_cfg_dir" ]]; then \
			echo "Error: both configs directories must exist:" >&2; \
			echo "  $$atf_cfg_dir" >&2; \
			echo "  $$uboot_cfg_dir" >&2; \
			return 1; \
		fi; \
		atf_list="$$(mktemp)"; \
		uboot_list="$$(mktemp)"; \
		trap 'rm -f "$$atf_list" "$$uboot_list"' RETURN; \
		find -L "$$atf_cfg_dir" -maxdepth 1 -type f -name '*_defconfig' -printf '%f\n' | sed 's/_defconfig$$//' | sort -u > "$$atf_list"; \
		find -L "$$uboot_cfg_dir" -maxdepth 1 -type f -name '*_defconfig' -printf '%f\n' | sed 's/_defconfig$$//' | sort -u > "$$uboot_list"; \
		comm -12 "$$atf_list" "$$uboot_list"; \
	}; \
	build_one_board() { \
		local cfg_base="$$1"; \
		local soc="$${cfg_base%%_*}"; \
		local board="$${cfg_base#*_}"; \
		mkdir -p output; \
		echo "----------------------------------------------------------------------"; \
		echo "Building BOARD=$$board (SOC=$$soc, VERSION=$(VERSION), VARIANT=$(VARIANT))"; \
		if [[ "$(BUILD_LOG)" =~ ^[yY1] ]]; then \
			local log_file="output/build-$${board}-$(VERSION)-$(VARIANT).log"; \
			echo "Log: $$log_file"; \
			env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS \
			BOARD="$$board" VERSION="$(VERSION)" VARIANT="$(VARIANT)" FSTHEME="$(FSTHEME)" \
			MULTI_LAYOUT="$(MULTI_LAYOUT)" FIXED_MTDPARTS="$(FIXED_MTDPARTS)" SIMG="$(SIMG)" \
			COPY_BL2="$(COPY_BL2)" SILENT="$(SILENT)" ./build.sh 2>&1 | tee "$$log_file"; \
		else \
			env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS \
			BOARD="$$board" VERSION="$(VERSION)" VARIANT="$(VARIANT)" FSTHEME="$(FSTHEME)" \
			MULTI_LAYOUT="$(MULTI_LAYOUT)" FIXED_MTDPARTS="$(FIXED_MTDPARTS)" SIMG="$(SIMG)" \
			COPY_BL2="$(COPY_BL2)" SILENT="$(SILENT)" ./build.sh; \
		fi; \
	}; \
	mapfile -t board_cfgs < <(collect_board_configs); \
	if [[ "$${#board_cfgs[@]}" -eq 0 ]]; then \
		echo "Error: no buildable BOARD found under $$ATF_DIR/configs and $$UBOOT_DIR/configs." >&2; \
		exit 1; \
	fi; \
	success_count=0; \
	fail_count=0; \
	total_count="$${#board_cfgs[@]}"; \
	index=0; \
	for cfg in "$${board_cfgs[@]}"; do \
		index=$$((index + 1)); \
		cfg_board="$${cfg#*_}"; \
		echo "[$$index/$$total_count] $$cfg_board"; \
		if build_one_board "$$cfg"; then \
			success_count=$$((success_count + 1)); \
		else \
			fail_count=$$((fail_count + 1)); \
			echo "Build failed for BOARD=$$cfg_board, continuing..." >&2; \
		fi; \
	done; \
	echo "----------------------------------------------------------------------"; \
	echo "Build summary: success=$$success_count, failed=$$fail_count, total=$$total_count"; \
	if [[ "$$fail_count" -gt 0 ]]; then \
		exit 1; \
	fi

boards:
	@set -euo pipefail; \
	case "$(VERSION)" in \
		2025) ATF_DIR="atf-20250711"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		SP1|sp1) ATF_DIR="atf-20240117-bacca82a8"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		SP2|sp2) ATF_DIR="atf-20260123"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		*) echo "Error: unsupported VERSION='$(VERSION)'." >&2; exit 1 ;; \
	esac; \
	collect_board_configs() { \
		local atf_cfg_dir="$$ATF_DIR/configs"; \
		local uboot_cfg_dir="$$UBOOT_DIR/configs"; \
		local atf_list uboot_list; \
		atf_list="$$(mktemp)"; \
		uboot_list="$$(mktemp)"; \
		trap 'rm -f "$$atf_list" "$$uboot_list"' RETURN; \
		find -L "$$atf_cfg_dir" -maxdepth 1 -type f -name '*_defconfig' -printf '%f\n' | sed 's/_defconfig$$//' | sort -u > "$$atf_list"; \
		find -L "$$uboot_cfg_dir" -maxdepth 1 -type f -name '*_defconfig' -printf '%f\n' | sed 's/_defconfig$$//' | sort -u > "$$uboot_list"; \
		comm -12 "$$atf_list" "$$uboot_list"; \
	}; \
	mapfile -t board_cfgs < <(collect_board_configs); \
	if [[ "$${#board_cfgs[@]}" -eq 0 ]]; then \
		echo "No buildable BOARD found."; \
		exit 0; \
	fi; \
	echo "Buildable BOARD list (intersection of $$ATF_DIR/configs and $$UBOOT_DIR/configs):"; \
	printf '  %s\n' "$${board_cfgs[@]#*_}"

board-configs:
	@set -euo pipefail; \
	case "$(VERSION)" in \
		2025) ATF_DIR="atf-20250711"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		SP1|sp1) ATF_DIR="atf-20240117-bacca82a8"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		SP2|sp2) ATF_DIR="atf-20260123"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		*) echo "Error: unsupported VERSION='$(VERSION)'." >&2; exit 1 ;; \
	esac; \
	collect_board_configs() { \
		local atf_cfg_dir="$$ATF_DIR/configs"; \
		local uboot_cfg_dir="$$UBOOT_DIR/configs"; \
		local atf_list uboot_list; \
		atf_list="$$(mktemp)"; \
		uboot_list="$$(mktemp)"; \
		trap 'rm -f "$$atf_list" "$$uboot_list"' RETURN; \
		find -L "$$atf_cfg_dir" -maxdepth 1 -type f -name '*_defconfig' -printf '%f\n' | sed 's/_defconfig$$//' | sort -u > "$$atf_list"; \
		find -L "$$uboot_cfg_dir" -maxdepth 1 -type f -name '*_defconfig' -printf '%f\n' | sed 's/_defconfig$$//' | sort -u > "$$uboot_list"; \
		comm -12 "$$atf_list" "$$uboot_list"; \
	}; \
	mapfile -t board_cfgs < <(collect_board_configs); \
	printf '%s\n' "$${board_cfgs[@]}"

gen-board-kconfig:
	@set -euo pipefail; \
	case "$(VERSION)" in \
		2025) ATF_DIR="atf-20250711"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		SP1|sp1) ATF_DIR="atf-20240117-bacca82a8"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		SP2|sp2) ATF_DIR="atf-20260123"; UBOOT_DIR="uboot-mtk-20250711" ;; \
		*) echo "Error: unsupported VERSION='$(VERSION)'." >&2; exit 1 ;; \
	esac; \
	collect_board_configs() { \
		local atf_cfg_dir="$$ATF_DIR/configs"; \
		local uboot_cfg_dir="$$UBOOT_DIR/configs"; \
		local atf_list uboot_list; \
		atf_list="$$(mktemp)"; \
		uboot_list="$$(mktemp)"; \
		trap 'rm -f "$$atf_list" "$$uboot_list"' RETURN; \
		find -L "$$atf_cfg_dir" -maxdepth 1 -type f -name '*_defconfig' -printf '%f\n' | sed 's/_defconfig$$//' | sort -u > "$$atf_list"; \
		find -L "$$uboot_cfg_dir" -maxdepth 1 -type f -name '*_defconfig' -printf '%f\n' | sed 's/_defconfig$$//' | sort -u > "$$uboot_list"; \
		comm -12 "$$atf_list" "$$uboot_list"; \
	}; \
	mapfile -t board_cfgs < <(collect_board_configs); \
	if [[ "$${#board_cfgs[@]}" -eq 0 ]]; then \
		echo "Error: no buildable BOARD found." >&2; \
		exit 1; \
	fi; \
	out="boards.kconfig"; \
	echo "# Auto-generated by: make gen-board-kconfig" > "$$out"; \
	echo "# Do not edit manually. Regenerate with: make gen-board-kconfig" >> "$$out"; \
	echo "" >> "$$out"; \
	echo "menu \"Board selection\"" >> "$$out"; \
	echo "" >> "$$out"; \
	echo "config BUILD_ALL_BOARDS" >> "$$out"; \
	echo "	bool \"Build all boards\"" >> "$$out"; \
	echo "	default n" >> "$$out"; \
	echo "	help" >> "$$out"; \
	echo "	  When enabled, all discovered boards will be built." >> "$$out"; \
	echo "	  Individual board selections below are ignored." >> "$$out"; \
	echo "" >> "$$out"; \
	for cfg in "$${board_cfgs[@]}"; do \
		board_name="$${cfg#*_}"; \
		sym_name=$$(echo "$$cfg" | tr '[:lower:]-' '[:upper:]_'); \
		echo "config BOARD_$$sym_name" >> "$$out"; \
		echo "	bool \"$$board_name\"" >> "$$out"; \
		echo "	depends on !BUILD_ALL_BOARDS" >> "$$out"; \
		echo "" >> "$$out"; \
	done; \
	echo "endmenu" >> "$$out"; \
	echo "Generated $$out with $${#board_cfgs[@]} boards."

atf:
	@set -euo pipefail; \
	printf '%s\n' "env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS ATF_DIR=\"$(ATF_DIR)\" VERSION=\"$(VERSION)\" VARIANT=\"$(VARIANT)\" ATFCFG_DIR=\"$(ATFCFG_DIR)\" CFG_SUBDIR=\"$(CFG_SUBDIR)\" OUTPUT_DIR=\"$(OUTPUT_DIR)\" OC7981=\"$(OC7981)\" OC7986=\"$(OC7986)\" TOOLCHAIN=\"$(TOOLCHAIN)\" ./compile_atf.sh"; \
	env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS \
	ATF_DIR="$(ATF_DIR)" VERSION="$(VERSION)" VARIANT="$(VARIANT)" \
	ATFCFG_DIR="$(ATFCFG_DIR)" CFG_SUBDIR="$(CFG_SUBDIR)" OUTPUT_DIR="$(OUTPUT_DIR)" \
	OC7981="$(OC7981)" OC7986="$(OC7986)" TOOLCHAIN="$(TOOLCHAIN)" ./compile_atf.sh

gpt:
	@set -euo pipefail; \
	printf '%s\n' "env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS VERSION=\"$(VERSION)\" SHOW=\"$(SHOW)\" DRAW=\"$(DRAW)\" SDMMC=\"$(SDMMC)\" ./generate_gpt.sh"; \
	env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS \
	VERSION="$(VERSION)" SHOW="$(SHOW)" DRAW="$(DRAW)" SDMMC="$(SDMMC)" ./generate_gpt.sh

clean:
	@set -euo pipefail; \
	printf '%s\n' "env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS CLEAN=1 VERSION=\"$(VERSION)\" ./build.sh"; \
	env -u MAKEFLAGS -u MAKELEVEL -u MFLAGS CLEAN=1 VERSION="$(VERSION)" ./build.sh

help:
	@printf '%s\n' \
		'Quick build entry points' \
		'' \
		'Usage:' \
		'  make                     # build the current .config selection (single or multi board)' \
		'  make all                 # build all BOARDs found in the intersection of atf/configs and uboot/configs' \
		'  make BOARD=<board>       # build a single BOARD (override .config)' \
		'  make menuconfig          # edit the root .config with a U-Boot-like menu UI' \
		'  make defconfig           # apply default configuration to .config' \
		'  make atf                 # call compile_atf.sh' \
		'  make gpt                 # call generate_gpt.sh' \
		'  make boards              # list buildable BOARDs' \
		'  make board-configs       # list buildable config names (for automation)' \
		'  make help                # show this help' \
		'' \
		'Board selection (via menuconfig):' \
		'  - Use "Build all boards" to select all boards at once' \
		'  - Or individually toggle boards in the list (multi-select supported)' \
		'  - boards.kconfig is auto-generated by: make gen-board-kconfig' \
		'' \
		'Common variables:' \
		'  VERSION=2025|SP1|SP2' \
		'  VARIANT=default|ubootmod|nonmbm|openwrt' \
		'  FSTHEME=bootstrap|gl|mtk' \
		'  BUILD_FIP=Y|N' \
		'  BUILD_ATF=Y|N' \
		'  BUILD_GPT=Y|N' \
		'  MULTI_LAYOUT=0|1' \
		'  FIXED_MTDPARTS=0|1' \
		'  SIMG=0|1' \
		'  SILENT=Y|N' \
		'' \
		'ATF / GPT helpers:' \
		'  make atf ATFCFG_DIR=mt798x_atf CFG_SUBDIR=normal OUTPUT_DIR=output_bl2' \
		'  make gpt SHOW=1' \
		'  make gpt DRAW=1' \
		'  make gpt SDMMC=1' \
		'' \
		'Notes:' \
		'  - BOARD discovery only uses the default configs directories, and only keeps entries' \
		'    that exist in both ATF and U-Boot, matching the FIP build workflow.' \
		'  - make runs with SILENT=Y by default so batch builds do not stop for prompts.'

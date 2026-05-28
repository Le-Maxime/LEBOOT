# SPDX-License-Identifier: GPL-2.0

WEBUI_FAILSAFE_GIT_HASH := $(shell \
	for try in . .. ../..; do \
		git -C $(srctree)$$try rev-parse --short=7 HEAD 2>/dev/null && break; \
	done || echo unknown)

WEBUI_FAILSAFE_GIT_DIRTY := $(shell \
	for try in . .. ../..; do \
		if git -C $(srctree)$$try rev-parse --is-inside-work-tree >/dev/null 2>&1; then \
			test -n "$$(git -C $(srctree)$$try status --porcelain --untracked-files=no 2>/dev/null)" && echo 1 || echo 0; \
			break; \
		fi; \
	done || echo 0)

ccflags-y += -DWEBUI_FAILSAFE_GIT_HASH=\"$(WEBUI_FAILSAFE_GIT_HASH)\"
ccflags-y += -DWEBUI_FAILSAFE_GIT_DIRTY=$(WEBUI_FAILSAFE_GIT_DIRTY)
ccflags-y += -Wno-error=date-time

ifeq ($(CONFIG_XPL_BUILD),)

ifeq ($(CONFIG_WEBUI_FAILSAFE_UI_GL),y)
obj-y += fsdata_gl/
else ifeq ($(CONFIG_WEBUI_FAILSAFE_UI_MTK),y)
obj-y += fsdata_mtk/
else ifeq ($(CONFIG_WEBUI_FAILSAFE_UI_LEBOOT),y)
obj-y += fsdata_leboot/
else
obj-y += fsdata/
endif

obj-y += fs.o failsafe.o
obj-$(CONFIG_WEBUI_FAILSAFE_CONSOLE) += failsafe_console.o
obj-$(CONFIG_WEBUI_FAILSAFE_ENV) += failsafe_env.o
obj-$(CONFIG_WEBUI_FAILSAFE_BACKUP) += failsafe_backup_flash.o
obj-$(CONFIG_WEBUI_FAILSAFE_UBI) += failsafe_ubi.o
obj-$(CONFIG_WEBUI_FAILSAFE_UI_BOOTSTRAP) += failsafe_theme.o
obj-$(CONFIG_WEBUI_FAILSAFE_UI_LEBOOT) += failsafe_theme.o

endif

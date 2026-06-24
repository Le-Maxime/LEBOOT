# SPDX-License-Identifier: GPL-2.0

WEBUI_FAILSAFE_GIT_HASH := $(or $(strip $(shell \
	for try in . .. ../..; do \
		git -C $(srctree)$$try rev-parse --short=7 HEAD 2>/dev/null && break; \
	done)),unknown)

WEBUI_FAILSAFE_GIT_DIRTY := $(or $(strip $(shell \
	for try in . .. ../..; do \
		if git -C $(srctree)$$try rev-parse --is-inside-work-tree >/dev/null 2>&1; then \
			test -n "$$(git -C $(srctree)$$try status --porcelain --untracked-files=no 2>/dev/null)" && echo 1 || echo 0; \
			break; \
		fi; \
	done)),0)

ccflags-y += -DWEBUI_FAILSAFE_GIT_HASH=\"$(WEBUI_FAILSAFE_GIT_HASH)\"
ccflags-y += -DWEBUI_FAILSAFE_GIT_DIRTY=$(WEBUI_FAILSAFE_GIT_DIRTY)
ccflags-y += -Wno-error=date-time

obj-y += helpers.o upgrade.o misc.o
obj-$(CONFIG_WEBUI_FAILSAFE_CONSOLE) += console.o
obj-$(CONFIG_WEBUI_FAILSAFE_ENV) += env.o
obj-$(CONFIG_WEBUI_FAILSAFE_BACKUP) += backup.o
obj-$(CONFIG_WEBUI_FAILSAFE_FLASH) += flash.o
obj-$(CONFIG_WEBUI_FAILSAFE_UBI) += ubi.o
obj-$(CONFIG_WEBUI_FAILSAFE_UI_BOOTSTRAP) += theme.o
obj-$(CONFIG_WEBUI_FAILSAFE_UI_LEBOOT) += theme.o

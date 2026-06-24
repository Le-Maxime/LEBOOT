/* SPDX-License-Identifier: GPL-2.0 */
/*
 * Copyright (C) 2026 Yuzhii0718
 *
 * All rights reserved.
 *
 * This file is part of the project bl-mt798x-dhcpd
 * You may not use, copy, modify or distribute this file except in compliance with the license agreement.
 *
 * Failsafe backup download module
 */

#include <errno.h>
#include <malloc.h>
#include <limits.h>
#include <linux/kernel.h>
#include <linux/string.h>
#include <linux/ctype.h>
#include <vsprintf.h>
#include <net/mtk_httpd.h>

#ifdef CONFIG_MTD
#include <linux/mtd/mtd.h>
#include <linux/mtd/nand.h>
#include <linux/mtd/spi-nor.h>
#include <linux/mtd/spinand.h>
#include "../../board/mediatek/common/mtd_helper.h"
#endif

#ifdef CONFIG_MTK_BOOTMENU_MMC
#include "../../board/mediatek/common/mmc_helper.h"
#endif

#ifdef CONFIG_PARTITIONS
#include <part.h>
#endif

#include "../failsafe_internal.h"

enum backup_phase {
	BACKUP_PHASE_HDR = 0,
	BACKUP_PHASE_DATA = 1,
};

struct backup_session {
	enum failsafe_storage_src src;
	enum backup_phase phase;

	u64 start;
	u64 end;
	u64 total;
	u64 cur;
	u64 target_size;

	char filename[128];
	char hdr[512];
	int hdr_len;

	void *buf;
	size_t buf_size;

#ifdef CONFIG_MTD
	struct mtd_info *mtd;
#endif
#ifdef CONFIG_MTK_BOOTMENU_MMC
	struct mmc *mmc;
	struct disk_partition dpart;
	u64 mmc_base;
#endif
};

#ifdef CONFIG_MTD
static const struct spinand_info *failsafe_spinand_match_info(struct spinand_device *spinand)
{
	size_t i;
	const struct spinand_manufacturer *manufacturer;
	const u8 *id;

	if (!spinand)
		return NULL;

	manufacturer = spinand->manufacturer;
	if (!manufacturer || !manufacturer->chips || !manufacturer->nchips)
		return NULL;

	id = spinand->id.data;

	for (i = 0; i < manufacturer->nchips; i++) {
		const struct spinand_info *info = &manufacturer->chips[i];

		if (!info->devid.id || !info->devid.len)
			continue;

		/* spinand->id.data[0] is manufacturer ID, device ID starts from [1]. */
		if (spinand->id.len < (int)(1 + info->devid.len))
			continue;

		if (!memcmp(id + 1, info->devid.id, info->devid.len))
			return info;
	}

	return NULL;
}

static const char *failsafe_get_mtd_chip_model(struct mtd_info *mtd, char *out, size_t out_sz)
{
	if (!out || !out_sz)
		return "";

	out[0] = '\0';

	if (!mtd)
		return "";

	/* SPI NOR: mtd->priv points to struct spi_nor (see spi-nor-core.c). */
	if (mtd->type == MTD_NORFLASH) {
		struct spi_nor *nor = mtd->priv;

		if (nor && nor->name && nor->name[0]) {
			snprintf(out, out_sz, "%s", nor->name);
			return out;
		}
	}

#if IS_ENABLED(CONFIG_MTD_SPI_NAND)
	/* SPI NAND: mtd->priv points to struct nand_device embedded in spinand_device. */
	if (mtd->type == MTD_NANDFLASH || mtd->type == MTD_MLCNANDFLASH) {
		struct spinand_device *spinand = mtd_to_spinand(mtd);
		const struct spinand_manufacturer *manufacturer;
		const struct spinand_info *info;
		const char *mname = NULL;
		const char *model = NULL;

		if (spinand) {
			manufacturer = spinand->manufacturer;
			info = failsafe_spinand_match_info(spinand);

			if (manufacturer && manufacturer->name && manufacturer->name[0])
				mname = manufacturer->name;
			if (info && info->model && info->model[0])
				model = info->model;

			if (mname && model) {
				snprintf(out, out_sz, "%s %s", mname, model);
				return out;
			}
			if (model) {
				snprintf(out, out_sz, "%s", model);
				return out;
			}
			if (mname) {
				snprintf(out, out_sz, "%s", mname);
				return out;
			}
		}
	}
#endif

	/* Fallback: keep old behavior. */
	if (mtd->name && mtd->name[0]) {
		snprintf(out, out_sz, "%s", mtd->name);
		return out;
	}

	return "";
}
#endif

void backupinfo_handler(enum httpd_uri_handler_status status,
	struct httpd_request *request,
	struct httpd_response *response)
{
	char *buf;
	int len = 0;
	int left = 16384;

	if (status == HTTP_CB_CLOSED) {
		free(response->session_data);
		return;
	}

	if (status != HTTP_CB_NEW)
		return;

	buf = malloc(left);
	if (!buf) {
		failsafe_http_reply_json(response, 500, "{}");
		return;
	}

	len += snprintf(buf + len, left - len, "{");

	/* MMC info + partitions */
	len += snprintf(buf + len, left - len, "\"mmc\":{");
#ifdef CONFIG_MTK_BOOTMENU_MMC
	{
		struct mmc *mmc;
		struct blk_desc *bd;
		bool present;

		mmc = _mmc_get_dev(CONFIG_MTK_BOOTMENU_MMC_DEV_INDEX, 0, false);
		bd = mmc ? mmc_get_blk_desc(mmc) : NULL;
		present = mmc && bd && bd->type != DEV_TYPE_UNKNOWN;

		if (present) {
			char pretty_vendor[256];

			failsafe_mmc_vendor_pretty(bd->vendor ? bd->vendor : "",
						   pretty_vendor, sizeof(pretty_vendor));
			len += snprintf(buf + len, left - len,
				"\"present\":true,\"vendor\":\"%s\",\"product\":\"%s\",\"blksz\":%lu,\"size\":%llu,",
				pretty_vendor, bd->product, (unsigned long)bd->blksz,
				(unsigned long long)mmc->capacity_user);
		} else {
			len += snprintf(buf + len, left - len, "\"present\":false,");
		}

		len += snprintf(buf + len, left - len, "\"parts\":[");
#ifdef CONFIG_PARTITIONS
		if (present) {
			struct disk_partition dpart;
			u32 i = 1;
			bool first = true;

			part_init(bd);
			while (len < left - 128) {
				if (part_get_info(bd, i, &dpart))
					break;

				if (!dpart.name[0]) {
					i++;
					continue;
				}

				len += snprintf(buf + len, left - len,
					"%s{\"name\":\"%s\",\"size\":%llu}",
					first ? "" : ",",
					dpart.name,
					(unsigned long long)dpart.size * dpart.blksz);

				first = false;
				i++;
			}
		}
#endif
		len += snprintf(buf + len, left - len, "]");
	}
#else
	len += snprintf(buf + len, left - len, "\"present\":false,\"parts\":[]");
#endif
	len += snprintf(buf + len, left - len, "},");

	/* MTD info + partitions */
	len += snprintf(buf + len, left - len, "\"mtd\":{");
#ifdef CONFIG_MTD
	{
		struct mtd_info *mtd, *sel = NULL;
		u32 i;
		bool first = true;
		const char *model = NULL;
		char model_buf[128];
		int type = -1;
		bool present = false;

		gen_mtd_probe_devices();

		/* Prefer a master MTD device (mtd->parent == NULL) for chip model info. */
		for (i = 0; i < 64; i++) {
			mtd = get_mtd_device(NULL, i);
			if (IS_ERR(mtd))
				continue;

			if (!sel) {
				sel = mtd;
			} else {
				if (mtd->parent) {
					put_mtd_device(mtd);
					continue;
				}

				/* Found master: replace current selection. */
				put_mtd_device(sel);
				sel = mtd;
				break;
			}

			if (!mtd->parent)
				break;
		}

		if (sel && !IS_ERR(sel)) {
			present = true;
			type = sel->type;
			model = failsafe_get_mtd_chip_model(sel, model_buf, sizeof(model_buf));
			put_mtd_device(sel);
		}

		len += snprintf(buf + len, left - len,
			"\"present\":%s,\"model\":\"%s\",\"type\":%d,",
			present ? "true" : "false",
			model ? model : "", type);

		len += snprintf(buf + len, left - len, "\"parts\":[");
		for (i = 0; i < 64 && len < left - 128; i++) {
			mtd = get_mtd_device(NULL, i);
			if (IS_ERR(mtd))
				continue;

			if (!mtd->name || !mtd->name[0]) {
				put_mtd_device(mtd);
				continue;
			}

			len += snprintf(buf + len, left - len,
				"%s{\"name\":\"%s\",\"size\":%llu,\"master\":%s}",
				first ? "" : ",",
				mtd->name,
				(unsigned long long)mtd->size,
				mtd->parent ? "false" : "true");

			first = false;
			put_mtd_device(mtd);
		}
		len += snprintf(buf + len, left - len, "]");
	}
#else
	len += snprintf(buf + len, left - len, "\"present\":false,\"parts\":[]");
#endif
	len += snprintf(buf + len, left - len, "}");
	len += snprintf(buf + len, left - len, "}");

	failsafe_http_reply_json_alloc(response, 200, buf, buf);
}

void backup_handler(enum httpd_uri_handler_status status,
	struct httpd_request *request,
	struct httpd_response *response)
{
	struct backup_session *st;
	char target_name[64] = "";
	char storage_sel[16] = "auto";
	u64 off_start = 0, off_end = 0;
	struct flash_target tgt;
	int ret;

	if (status == HTTP_CB_CLOSED) {
		st = response->session_data;
		if (st) {
#ifdef CONFIG_MTD
			if (st->mtd)
				put_mtd_device(st->mtd);
#endif
			free(st->buf);
			free(st);
		}
		return;
	}

	if (status == HTTP_CB_NEW) {
		struct httpd_form_value *mode, *start, *end;

		mode = httpd_request_find_value(request, "mode");
		start = httpd_request_find_value(request, "start");
		end = httpd_request_find_value(request, "end");

		ret = flash_parse_storage_target(request, storage_sel,
						  sizeof(storage_sel),
						  target_name, sizeof(target_name));
		if (ret || !mode || !mode->data)
			goto bad;

		if (!strcmp(mode->data, "part")) {
			off_start = 0;
			off_end = ULLONG_MAX;
		} else if (!strcmp(mode->data, "range")) {
			if (!start || !end || !start->data || !end->data)
				goto bad;

			if (parse_u64_len(start->data, &off_start))
				goto bad;
			if (parse_u64_len(end->data, &off_end))
				goto bad;
		} else {
			goto bad;
		}

		st = calloc(1, sizeof(*st));
		if (!st)
			goto oom;

		st->buf_size = 64 * 1024;
		st->buf = malloc(st->buf_size);
		if (!st->buf) {
			free(st);
			goto oom;
		}

		/* Use shared flash_open_target to resolve MTD/MMC target */
		ret = flash_open_target(storage_sel, target_name, &tgt);
		if (ret)
			goto bad_target;

		/* Copy target info into backup session */
		st->src = tgt.src;
		st->target_size = tgt.size;
#ifdef CONFIG_MTD
		st->mtd = tgt.mtd;
		/* Transfer ownership: don't let flash_close_target release it */
		tgt.mtd = NULL;
#endif
#ifdef CONFIG_MTK_BOOTMENU_MMC
		if (tgt.src == FAILSAFE_SRC_MMC) {
			st->mmc = tgt.mmc;
			st->dpart = tgt.dpart;
			if (!strcmp(target_name, "raw")) {
				st->mmc_base = 0;
			} else {
				st->mmc_base = (u64)st->dpart.start * st->dpart.blksz;
			}
		}
#endif
		flash_close_target(&tgt);

		/* range normalization */
		if (off_end == ULLONG_MAX)
			off_end = st->target_size;

		if (off_start >= off_end)
			goto bad_range;
		if (off_end > st->target_size)
			goto bad_range;

		st->start = off_start;
		st->end = off_end;
		st->total = st->end - st->start;
		st->cur = 0;
		st->phase = BACKUP_PHASE_HDR;

		/* filename */
		{
			char model[64] = "";
			const char *stype = st->src == FAILSAFE_SRC_MTD ? "mtd" : "mmc";

			if (st->src == FAILSAFE_SRC_MMC) {
#ifdef CONFIG_MTK_BOOTMENU_MMC
				struct blk_desc *bd = mmc_get_blk_desc(st->mmc);
				if (bd)
					strlcpy(model, bd->product, sizeof(model));
#endif
			} else {
#ifdef CONFIG_MTD
				if (st->mtd && st->mtd->name)
					strlcpy(model, st->mtd->name, sizeof(model));
#endif
			}

			failsafe_str_sanitize(model);
			failsafe_str_sanitize(target_name);

			snprintf(st->filename, sizeof(st->filename),
				"backup_%s_%s_%s_0x%llx-0x%llx.bin",
				stype,
				model[0] ? model : "device",
				target_name,
				(unsigned long long)st->start,
				(unsigned long long)st->end);
		}

		/* build HTTP header (CUSTOM response must include header) */
		st->hdr_len = snprintf(st->hdr, sizeof(st->hdr),
			"HTTP/1.1 200 OK\r\n"
			"Content-Type: application/octet-stream\r\n"
			"Content-Length: %llu\r\n"
			"Content-Disposition: attachment; filename=\"%s\"\r\n"
			"Cache-Control: no-store\r\n"
			"Connection: close\r\n"
			"\r\n",
			(unsigned long long)st->total,
			st->filename);

		response->session_data = st;
		response->status = HTTP_RESP_CUSTOM;
		response->data = st->hdr;
		response->size = st->hdr_len;
		return;
	}

	if (status == HTTP_CB_RESPONDING) {
		u64 remain;
		size_t to_read, got = 0;

		st = response->session_data;
		if (!st) {
			response->status = HTTP_RESP_NONE;
			return;
		}

		if (st->phase == BACKUP_PHASE_HDR)
			st->phase = BACKUP_PHASE_DATA;

		remain = st->total - st->cur;
		if (!remain) {
			response->status = HTTP_RESP_NONE;
			return;
		}

		to_read = (size_t)min_t(u64, remain, st->buf_size);

		if (st->src == FAILSAFE_SRC_MTD) {
#ifdef CONFIG_MTD
			size_t readsz = 0;

			ret = mtd_read_skip_bad(st->mtd, st->start + st->cur,
					to_read,
					st->mtd->size - (st->start + st->cur),
					&readsz, st->buf);
			if (ret)
				goto io_err;

			got = readsz;
#else
			goto io_err;
#endif
		} else {
#ifdef CONFIG_MTK_BOOTMENU_MMC
			ret = mmc_read_generic(CONFIG_MTK_BOOTMENU_MMC_DEV_INDEX, 0,
					st->mmc_base + st->start + st->cur,
					st->buf, to_read);
			if (ret)
				goto io_err;

			got = to_read;
#else
			goto io_err;
#endif
		}

		if (!got)
			goto io_err;

		st->cur += got;

		response->status = HTTP_RESP_CUSTOM;
		response->data = (const char *)st->buf;
		response->size = got;
		return;
	}

	return;

bad:
	failsafe_http_reply_text(response, 400, "bad request");
	return;

bad_target:
	free(st->buf);
	free(st);
	failsafe_http_reply_text(response, 404, "target not found");
	return;

bad_range:
#ifdef CONFIG_MTD
	if (st->mtd)
		put_mtd_device(st->mtd);
#endif
	free(st->buf);
	free(st);
	failsafe_http_reply_text(response, 400, "invalid range");
	return;

oom:
	failsafe_http_reply_text(response, 500, "no mem");
	return;

io_err:
	response->status = HTTP_RESP_NONE;
	return;
}

#ifdef CONFIG_WEBUI_FAILSAFE_BACKUP
void backup_register_handlers(struct httpd_instance *inst)
{
	httpd_register_uri_handler(inst, "/backup.html", &html_handler, NULL);
	httpd_register_uri_handler(inst, "/backup_js.js", &js_handler, NULL);
	httpd_register_uri_handler(inst, "/backup/info", &backupinfo_handler, NULL);
	httpd_register_uri_handler(inst, "/backup/main", &backup_handler, NULL);
}
#endif

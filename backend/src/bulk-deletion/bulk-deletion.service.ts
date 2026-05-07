import { Injectable } from '@nestjs/common';
import { DeletionRequestService } from '../deletion-request/deletion-request.service';
import { BulkDeletionResponseDto, BulkDeletionRowResult } from './dto/bulk-deletion-response.dto';

@Injectable()
export class BulkDeletionService {
  constructor(private readonly deletionRequestService: DeletionRequestService) {}

  async processCsvBuffer(buffer: Buffer): Promise<BulkDeletionResponseDto> {
    const text = buffer.toString('utf-8');
    const rawRows = this.parseSubjectIds(text);

    const rows: BulkDeletionRowResult[] = [];
    const requestIds: string[] = [];
    const seen = new Set<string>();
    let created = 0;
    let skipped = 0;

    for (let i = 0; i < rawRows.length; i++) {
      // Trim here so whitespace-only values are treated as blank
      const subjectId = rawRows[i].trim();
      const rowNumber = i + 1;

      if (!subjectId) {
        rows.push({ row: rowNumber, subject_id: '', status: 'skipped', reason: 'blank' });
        skipped++;
        continue;
      }

      if (seen.has(subjectId)) {
        rows.push({ row: rowNumber, subject_id: subjectId, status: 'skipped', reason: 'duplicate' });
        skipped++;
        continue;
      }

      seen.add(subjectId);

      const result = await this.deletionRequestService.createDeletionRequest({ subject_id: subjectId });
      requestIds.push(result.request_id);
      rows.push({ row: rowNumber, subject_id: subjectId, status: 'created', request_id: result.request_id });
      created++;
    }

    return { created, skipped, request_ids: requestIds, rows };
  }

  private parseSubjectIds(text: string): string[] {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');

    if (lines.length === 0) return [];

    // Use trimmed first line only for header detection
    const firstLineTrimmed = lines[0].trim().toLowerCase().replace(/^"(.*)"$/, '$1');

    let values: string[];

    if (firstLineTrimmed === 'subject_id') {
      // Single-column CSV with 'subject_id' header — keep raw values (no trim)
      values = lines.slice(1).map((l) => this.unquote(l));
    } else {
      // Check for multi-column CSV with a 'subject_id' column
      const cols = lines[0].split(',').map((c) => c.trim().toLowerCase().replace(/^"(.*)"$/, '$1'));
      const subjectIdIndex = cols.indexOf('subject_id');

      if (subjectIdIndex >= 0) {
        values = lines.slice(1).map((line) => {
          const fields = line.split(',');
          const val = fields[subjectIdIndex];
          return val ? this.unquote(val) : '';
        });
      } else {
        // No header detected: treat every line as a raw subject_id value
        values = lines.map((l) => this.unquote(l));
      }
    }

    // Strip trailing strictly-empty strings that are artifacts of a trailing
    // newline in the file.  Whitespace-only strings ('   ') are preserved so
    // processCsvBuffer can classify them as blank rows.
    while (values.length > 0 && values[values.length - 1] === '') {
      values.pop();
    }

    return values;
  }

  private unquote(s: string): string {
    if (s.startsWith('"') && s.endsWith('"')) {
      return s.slice(1, -1);
    }
    return s;
  }
}

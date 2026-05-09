import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ProofEvent } from '../database/entities';
import { computeProofEventHash, genesisHashForRequest } from './proof-hash.util';

type AppendProofEventInput = {
  request_id: string;
  service_name: string;
  event_type: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class ProofChainService {
  constructor(
    @InjectRepository(ProofEvent)
    private readonly proofEventRepository: Repository<ProofEvent>,
  ) {}

  async appendEvent(event: AppendProofEventInput): Promise<void> {
    const timestampIso =
      (typeof event.payload.timestamp === 'string' && event.payload.timestamp) ||
      new Date().toISOString();

    try {
      await this.proofEventRepository.manager.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
          [event.request_id, 'proof_chain'],
        );

        const proofEventRepository = manager.getRepository(ProofEvent);
        const last = await proofEventRepository
          .createQueryBuilder('p')
          .where('p.request_id = :rid', { rid: event.request_id })
          .orderBy('p.created_at', 'DESC')
          .addOrderBy('p.id', 'DESC')
          .getOne();

        const previous_hash =
          last?.event_hash && last.event_hash.length > 0
            ? last.event_hash
            : genesisHashForRequest(event.request_id);

        const event_hash = computeProofEventHash(
          previous_hash,
          event.request_id,
          event.service_name,
          event.event_type,
          event.payload,
          timestampIso,
        );

        await proofEventRepository.save(
          proofEventRepository.create({
            ...event,
            previous_hash,
            event_hash,
          }),
        );
      });
    } catch (error) {
      if (this.isDuplicateProofEvent(error)) {
        return;
      }

      throw error;
    }
  }

  private isDuplicateProofEvent(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = (error as { driverError?: { code?: string } }).driverError;
    return driverError?.code === '23505';
  }
}
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProofEvent } from '../entities';

@Injectable()
export class ProofService {
  constructor(
    @InjectRepository(ProofEvent)
    private proofEventRepository: Repository<ProofEvent>,
  ) {}

  async getProofByRequestId(requestId: string) {
    const events = await this.proofEventRepository.find({
      where: { request_id: requestId },
      order: { created_at: 'ASC' },
    });

    if (events.length === 0) {
      throw new NotFoundException(`No proof events found for request ${requestId}`);
    }

    const servicesInvolved = Array.from(new Set(events.map((event) => event.service_name)));

    return {
      request_id: requestId,
      events: events.map((event) => ({
        id: event.id,
        service_name: event.service_name,
        event_type: event.event_type,
        payload: event.payload,
        created_at: event.created_at,
      })),
      verification_summary: {
        total_events: events.length,
        services_involved: servicesInvolved,
      },
    };
  }
}

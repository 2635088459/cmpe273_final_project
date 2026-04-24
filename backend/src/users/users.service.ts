import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities';

const DEMO_USERS = [
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    username: 'alice',
    email: 'alice@example.com'
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000002',
    username: 'bob',
    email: 'bob@example.com'
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000003',
    username: 'charlie',
    email: 'charlie@example.com'
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000004',
    username: 'diana',
    email: 'diana@example.com'
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000005',
    username: 'eve',
    email: 'eve@example.com'
  }
];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>
  ) {}

  async listUsers(): Promise<User[]> {
    return this.userRepository.find({
      order: {
        username: 'ASC'
      }
    });
  }

  async restoreDemoUsers(): Promise<User[]> {
    await this.userRepository.upsert(DEMO_USERS, ['id']);
    return this.listUsers();
  }
}

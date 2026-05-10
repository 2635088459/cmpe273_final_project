import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { User } from '../database/entities';
import { UsersService } from './users.service';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
  })),
}));

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: any;
  let dataSource: any;

  beforeEach(async () => {
    userRepository = {
      find: jest.fn().mockResolvedValue([
        { id: '1', username: 'alice', email: 'alice@example.com' },
        { id: '2', username: 'bob', email: 'bob@example.com' },
      ]),
      upsert: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('redis://test:6379') } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('listUsers returns users ordered by username', async () => {
    const users = await service.listUsers();

    expect(users).toHaveLength(2);
    expect(userRepository.find).toHaveBeenCalledWith({
      order: { username: 'ASC' },
    });
  });

  it('restoreDemoUsers upserts demo users and seeds distributed stores', async () => {
    const users = await service.restoreDemoUsers();

    expect(userRepository.upsert).toHaveBeenCalledTimes(1);
    expect(dataSource.query).toHaveBeenCalled();

    const RedisCtor = Redis as unknown as jest.Mock;
    expect(RedisCtor).toHaveBeenCalledTimes(1);

    expect(users).toHaveLength(2);
  });
});

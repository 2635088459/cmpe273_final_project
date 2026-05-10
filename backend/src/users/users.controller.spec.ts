import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: { listUsers: jest.Mock; restoreDemoUsers: jest.Mock };

  beforeEach(async () => {
    usersService = {
      listUsers: jest.fn(),
      restoreDemoUsers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  it('listUsers delegates to service', async () => {
    const expected = [{ id: '1', username: 'alice', email: 'alice@example.com' }];
    usersService.listUsers.mockResolvedValueOnce(expected);

    const result = await controller.listUsers();

    expect(result).toEqual(expected);
    expect(usersService.listUsers).toHaveBeenCalledTimes(1);
  });

  it('restoreDemoUsers delegates to service', async () => {
    const expected = [{ id: '1', username: 'alice', email: 'alice@example.com' }];
    usersService.restoreDemoUsers.mockResolvedValueOnce(expected);

    const result = await controller.restoreDemoUsers();

    expect(result).toEqual(expected);
    expect(usersService.restoreDemoUsers).toHaveBeenCalledTimes(1);
  });
});

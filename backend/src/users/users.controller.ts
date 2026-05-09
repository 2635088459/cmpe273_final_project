import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '../database/entities';
import { UsersService } from './users.service';

@ApiTags('Demo Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List demo users',
    description: 'Returns the current users in the primary data store for demo visibility'
  })
  @ApiResponse({
    status: 200,
    description: 'Current demo users',
    type: [User]
  })
  async listUsers(): Promise<User[]> {
    return this.usersService.listUsers();
  }

  @Post('restore-demo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore demo users',
    description: 'Recreates the seeded demo users and repopulates search, analytics, and cache demo data so deletion proofs show non-empty cleanup results'
  })
  @ApiResponse({
    status: 200,
    description: 'Restored demo users',
    type: [User]
  })
  async restoreDemoUsers(): Promise<User[]> {
    return this.usersService.restoreDemoUsers();
  }
}

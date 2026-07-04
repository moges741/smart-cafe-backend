import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum AnalyticsPeriod {
  TODAY      = 'today',
  THIS_WEEK  = 'this_week',
  THIS_MONTH = 'this_month',
}

export class AnalyticsQueryDto {
  // Period defaults to this_month if not provided
  @ApiPropertyOptional({
    enum: AnalyticsPeriod,
    default: AnalyticsPeriod.THIS_MONTH,
    description: 'Time period for the analytics',
  })
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  period?: AnalyticsPeriod = AnalyticsPeriod.THIS_MONTH;

  // Filter by branch — if omitted, returns data across all branches
  @ApiPropertyOptional({
    description: 'Filter by specific branch UUID — omit for all branches',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
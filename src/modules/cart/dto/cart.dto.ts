import { IsString, IsInt, Min, IsOptional, IsNumber } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  quantity: number;
}

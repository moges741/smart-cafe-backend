import { IsUUID, IsNumber, IsArray, ValidateNested, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RecipeIngredientDto {
  @ApiProperty({ example: 'uuid-of-material' })
  @IsUUID()
  materialId: string;

  @ApiProperty({ example: 0.018, description: 'Quantity of ingredient required (e.g. 0.018 kg, 0.200 L)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;
}

export class CreateRecipeDto {
  @ApiProperty({ example: 'uuid-of-product' })
  @IsUUID()
  productId: string;

  @ApiProperty({ type: [RecipeIngredientDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients: RecipeIngredientDto[];
}

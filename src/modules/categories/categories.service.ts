import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { UploadedImageFile } from '../../common/interfaces/uploaded-image-file.interface';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  create(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  findAll(branchId?: string, includeInactive = false) {
    const where: any = {};
    if (!includeInactive) where.isActive = true;
    if (branchId) where.branchId = branchId;
    
    return this.prisma.category.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { products: { where: { isAvailable: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: string, dto: Partial<CreateCategoryDto>) {
    await this.findOne(id); // throws if not found
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    // soft delete — never hard delete categories that have order history
    return this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async updateImage(id: string, file?: UploadedImageFile) {
    if (!file) {
      throw new BadRequestException('Category image is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are supported');
    }

    await this.findOne(id);

    const uploadResult = await this.cloudinaryService.uploadImage(file, `smart-cafe/categories/${id}`);

    return this.prisma.category.update({
      where: { id },
      data: { imageUrl: uploadResult.secureUrl },
    });
  }
}
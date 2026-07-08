import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { UploadedImageFile } from '../../common/interfaces/uploaded-image-file.interface';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private validateImageFile(file: UploadedImageFile) {
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are supported');
    }
  }

  private async uploadAndStoreImages(productId: string, files: UploadedImageFile[]) {
    if (!files.length) {
      return;
    }

    files.forEach((file) => this.validateImageFile(file));

    const uploadResults = await Promise.all(
      files.map((file) => this.cloudinaryService.uploadImage(file, `smart-cafe/products/${productId}`)),
    );

    const lastPosition =
      (await this.prisma.productImage.aggregate({
        where: { productId },
        _max: { position: true },
      }))._max.position ?? -1;

    await this.prisma.$transaction(
      uploadResults.map((result, index) =>
        this.prisma.productImage.create({
          data: {
            productId,
            url: result.secureUrl,
            publicId: result.publicId,
            position: lastPosition + index + 1,
          },
        }),
      ),
    );

    return uploadResults;
  }

  private async ensurePrimaryProductImage(productId: string, secureUrl: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { imageUrl: true },
    });

    if (!product?.imageUrl) {
      await this.prisma.product.update({
        where: { id: productId },
        data: { imageUrl: secureUrl },
      });
    }
  }

  create(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: dto,
      include: {
        category: true,
        branch: true,
        images: { orderBy: { position: 'asc' } },
      },
    });
  }

  findAll(query: QueryProductDto) {
    return this.prisma.product.findMany({
      where: {
        ...(query.branchId && { branchId: query.branchId }),
        ...(query.categoryId && { categoryId: query.categoryId }),
        ...(query.isAvailable !== undefined && { isAvailable: query.isAvailable }),
      },
      include: {
        category: { select: { id: true, name: true, imageUrl: true } },
        images: { orderBy: { position: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        branch: true,
        images: { orderBy: { position: 'asc' } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: Partial<CreateProductDto>) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: {
        category: true,
        branch: true,
        images: { orderBy: { position: 'asc' } },
      },
    });
  }

  async toggleAvailability(id: string) {
    const product = await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { isAvailable: !product.isAvailable },
    });
  }

  async addImages(productId: string, coverImage?: UploadedImageFile, galleryImages: UploadedImageFile[] = []) {
    const product = await this.findOne(productId);
    const files = [coverImage, ...galleryImages].filter(Boolean) as UploadedImageFile[];

    if (!files.length) {
      throw new BadRequestException('At least one image file is required');
    }

    const uploadResults = await this.uploadAndStoreImages(productId, files);

    if (coverImage || !product.imageUrl) {
      await this.prisma.product.update({
        where: { id: productId },
        data: { imageUrl: uploadResults[0].secureUrl },
      });
    }

    return this.findOne(productId);
  }
}
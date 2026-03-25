export interface ScrapedPromo {
    title: string;
    price: string;
    originalPrice: string;
    url: string;
    imageUrl: string;
    coupon?: string;
    additionalImages?: string[];
}
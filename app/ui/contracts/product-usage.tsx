import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

// Use the same User type as in active-users.tsx for consistency
type User = {
  id: number;
  name: string;
  email: string | null;
  contract_id: number | null;
  product_id: number | null;
  created_at: string;
  updated_at: string | null;
  vendor_products: VendorProduct | null;
};

import { VendorProduct, VendorProductUser } from '@/constants/types';

type SubscriptionUsageSummary = {
  id: number;
  name: string;
  currentUsers: number;
  maxUsers: number;
  percentage: number;
  rawPercentage: number;
  type: 'subscription';
};

type UnsubscribedProductUsageSummary = {
  id: string;
  productId: number;
  name: string;
  currentUsers: number;
  type: 'unsubscribed';
};

type ProductUsageSummary =
  | SubscriptionUsageSummary
  | UnsubscribedProductUsageSummary;

export function ProductUsage({
  users,
  vendorProductsUsers,
}: {
  users: User[];
  vendorProductsUsers: VendorProductUser[];
}) {
  const [productUsage, setProductUsage] = useState<ProductUsageSummary[]>([]);

  useEffect(() => {
    // Get product names from users
    const productNames: Record<number, string> = {};

    users.forEach((user) => {
      if (
        user.product_id !== null &&
        user.product_id !== undefined &&
        user.vendor_products
      ) {
        productNames[user.product_id] = user.vendor_products.name;
      }
    });

    // Count users by product_id directly (for products without subscriptions)
    const directProductCounts: Record<number, number> = {};
    users.forEach((user) => {
      if (user.product_id !== undefined && user.product_id !== null) {
        directProductCounts[user.product_id] =
          (directProductCounts[user.product_id] || 0) + 1;
      }
    });

    // Process the regular subscriptions
    const subscriptionCounts: Record<number, number> = {};
    const productToSubscriptionMap: Record<number, number> = {};

    // Initialize counts for all subscriptions to 0 and build product-to-subscription mapping
    vendorProductsUsers.forEach((subscription) => {
      subscriptionCounts[subscription.id] = 0;
      productToSubscriptionMap[subscription.product_id] = subscription.id;
    });

    // Count users for each subscription
    users.forEach((user) => {
      if (
        user.product_id !== undefined &&
        user.product_id !== null &&
        productToSubscriptionMap[user.product_id]
      ) {
        // User with a specific product_id contributes to that product's subscription
        subscriptionCounts[productToSubscriptionMap[user.product_id]]++;
      }
    });

    // Find product IDs that have users but no subscription entries
    const productsWithoutSubscriptions = Object.keys(directProductCounts)
      .map(Number)
      .filter(
        (productId) =>
          !vendorProductsUsers.some((sub) => sub.product_id === productId),
      );

    // Combine both types into a single summary
    const usageSummary: ProductUsageSummary[] = [];

    // Add entries from vendorProductsUsers (subscriptions)
    vendorProductsUsers.forEach((subscription) => {
      const maxUsers = subscription.number_of_users || 0;
      const currentUsers = subscriptionCounts[subscription.id] || 0;
      const rawPercentage = maxUsers > 0 ? (currentUsers / maxUsers) * 100 : 0;

      usageSummary.push({
        id: subscription.id,
        name: subscription.vendor_products.name,
        currentUsers,
        maxUsers,
        percentage: Math.min(100, rawPercentage),
        rawPercentage,
        type: 'subscription',
      });
    });

    // Add entries for products without subscription entries
    productsWithoutSubscriptions.forEach((productId) => {
      const currentUsers = directProductCounts[productId] || 0;
      // Use the name from user data if available, otherwise use a default
      const name = productNames[productId] || `Product ${productId}`;

      usageSummary.push({
        id: `product-${productId}`,
        productId,
        name,
        currentUsers,
        type: 'unsubscribed',
      });
    });

    setProductUsage(usageSummary);
  }, [users, vendorProductsUsers]);

  return (
    <div
      className={`grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 ${productUsage.length > 0 && 'mb-8'}`}
    >
      {productUsage.map((product) => {
        if (product.type === 'subscription') {
          // Determine color class based on usage
          const colorClass =
            product.rawPercentage > 100
              ? '[&>div]:bg-pink-600'
              : product.rawPercentage >= 90
                ? '[&>div]:bg-pink-600'
                : product.rawPercentage >= 50
                  ? '[&>div]:bg-amber-500'
                  : '[&>div]:bg-green-500';

          return (
            <Card
              key={product.id}
              className="overflow-hidden border-border dark:border-border"
            >
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium line-clamp-2 text-sm leading-tight">
                      {product.name}
                    </h3>
                  </div>
                  <Progress
                    value={product.percentage}
                    className={`h-2 ${colorClass}`}
                  />
                  <div className="mt-4 font-serif text-sm">
                    {product.currentUsers}
                    <span className="">/{product.maxUsers} users</span>
                    {product.rawPercentage > 100 && (
                      <span className="ml-2 text-pink-700">
                        <span className="text-foreground">—</span>{' '}
                        {product.currentUsers - product.maxUsers} over!
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        } else {
          // Product usage where # of users was not captured
          return (
            <Card
              key={product.id}
              className="overflow-hidden border-border dark:border-border"
            >
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium line-clamp-2 text-sm leading-tight">
                      {product.name}
                    </h3>
                  </div>
                  <Progress value={100} className="h-2 [&>div]:bg-gray-700" />
                  <div className="mt-4 font-serif text-sm">
                    {product.currentUsers} users
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }
      })}
    </div>
  );
}

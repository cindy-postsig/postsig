/**
 * Calculate product usage based on contract users and licensed seats.
 *
 * Field naming:
 *   - assigned = number of real users linked to a product (rows in contract_users)
 *   - licensed = contractual seat cap (number_of_users on vendor_products_users)
 */

interface ContractUser {
  id: number;
  name: string;
  email: string;
  product_id: number;
  vendor_products?: {
    name: string;
  };
}

interface ProductSeat {
  product_id: number;
  number_of_users: number;
  vendor_products?: {
    name: string;
  };
}

interface Product {
  vendor_products?: {
    id: number;
    name: string;
  };
  fees: string | number;
  compoundedFees: number;
}

interface ProductUsageResult {
  contractUsers: Array<{
    id: number;
    name: string;
    email: string;
    productId: number;
    productName: string;
  }>;
  totalSeats: {
    assigned: number;
    licensed: number;
    value: number;
    valuePerSeat: number;
    unusedSeatsValue: number;
  };
  byProduct: {
    [key: string]: {
      id: number;
      name: string;
      seats: {
        assigned: number;
        licensed: number;
        value: number;
        valuePerSeat: number;
        unusedSeatsValue: number;
      };
      users: Array<{
        id: number;
        name: string;
        email: string;
      }>;
    };
  };
}

interface ProductsWithLicenses {
  [key: string]: {
    id: number;
    name: string;
    seats: {
      assigned: number;
      licensed: number;
      value: number;
      valuePerSeat: number;
      unusedSeatsValue: number;
    };
    users: Array<{
      id: number;
      name: string;
      email: string;
    }>;
  };
}

export function calculateProductUsage(
  contract: {
    contract_users?: ContractUser[];
    vendor_products_users?: ProductSeat[];
  },
  currentProducts: Product[] = [],
  currentBudget: number = 0,
): ProductUsageResult {
  const contractUsers = contract.contract_users || [];
  const productSeatsData = contract.vendor_products_users || [];

  // Initialize result object
  const result: ProductUsageResult = {
    contractUsers: [],
    totalSeats: {
      assigned: 0,
      licensed: 0,
      value: 0,
      valuePerSeat: 0,
      unusedSeatsValue: 0,
    },
    byProduct: {},
  };

  // Calculate total licensed seats by summing up all product-specific entries
  let totalLicensedSeats = productSeatsData.reduce(
    (sum: number, seat: ProductSeat) => {
      return sum + (seat.number_of_users || 0);
    },
    0,
  );

  result.totalSeats.licensed = totalLicensedSeats;

  // Process product-specific seats and calculate value per seat
  productSeatsData.forEach((seat: ProductSeat) => {
    const productId = seat.product_id;

    // Skip if productId is null or undefined
    if (productId === null || productId === undefined) {
      return; // Skip this seat entry
    }

    const productName = seat.vendor_products?.name || `Product ${productId}`;

    // Find the corresponding product in currentProducts to get the fees
    const productInfo = currentProducts.find(
      (p: Product) => p.vendor_products?.id === productId,
    );

    const productFees = productInfo
      ? parseFloat(productInfo.compoundedFees.toString()) || 0
      : 0;
    const licensedSeats = seat.number_of_users || 0;
    const valuePerSeat = licensedSeats > 0 ? productFees / licensedSeats : 0;

    if (!result.byProduct[productId.toString()]) {
      result.byProduct[productId.toString()] = {
        id: productId,
        name: productName,
        seats: {
          assigned: 0,
          licensed: licensedSeats,
          value: productFees,
          valuePerSeat: valuePerSeat,
          unusedSeatsValue: 0, // Will be calculated after counting assigned seats
        },
        users: [],
      };
    } else {
      result.byProduct[productId.toString()].seats.licensed = licensedSeats;
      result.byProduct[productId.toString()].seats.value = productFees;
      result.byProduct[productId.toString()].seats.valuePerSeat = valuePerSeat;
    }
  });

  // Process users
  contractUsers.forEach((user: ContractUser) => {
    // Add to total users count
    result.totalSeats.assigned++;

    // Add to contractUsers list
    result.contractUsers.push({
      id: user.id,
      name: user.name,
      email: user.email,
      productId: user.product_id,
      productName: user.vendor_products?.name || '',
    });

    // Organize by product
    const productId = user.product_id;

    // Skip if productId is null or undefined
    if (productId === null || productId === undefined) {
      return; // Skip this user
    }

    // Initialize product in byProduct if not exists
    if (!result.byProduct[productId.toString()]) {
      const productName = user.vendor_products?.name || `Product ${productId}`;

      // Find the corresponding product in currentProducts to get the fees
      const productInfo = currentProducts.find(
        (p: Product) => p.vendor_products?.id === productId,
      );

      const productFees = productInfo
        ? parseFloat(productInfo.compoundedFees.toString()) || 0
        : 0;

      result.byProduct[productId.toString()] = {
        id: productId,
        name: productName,
        seats: {
          assigned: 0,
          licensed: 0,
          value: productFees,
          valuePerSeat: 0, // Will be calculated once we know licensed seats
          unusedSeatsValue: 0,
        },
        users: [],
      };
    }

    // Add user to product and increment assigned count
    // At this point we know productId is not null because of the check above
    result.byProduct[productId.toString()].users.push({
      id: user.id,
      name: user.name,
      email: user.email,
    });
    result.byProduct[productId.toString()].seats.assigned++;
  });

  // First, calculate unused seats value for each product
  Object.keys(result.byProduct).forEach((productId) => {
    const product = result.byProduct[productId];

    // Calculate value of unused seats for this product
    const unusedSeats = Math.max(
      0,
      product.seats.licensed - product.seats.assigned,
    );
    product.seats.unusedSeatsValue = unusedSeats * product.seats.valuePerSeat;
  });

  // We'll store products with licenses > 0 in a new object
  const productsWithLicenses: ProductsWithLicenses = {};

  // Filter to only include products with licensed > 0
  Object.keys(result.byProduct).forEach((productId) => {
    const product = result.byProduct[productId];
    if (product.seats.licensed > 0) {
      productsWithLicenses[productId] = product;
    }
  });

  // Replace byProduct with only licensed products
  result.byProduct = productsWithLicenses;

  // Get array of licensed products for calculations
  const licensedProductsArray = Object.values(result.byProduct);

  // Calculate totals from all products with licenses
  // Note: If there are no products with licenses, we keep the zeros
  // that were set in the initialization of result.totalSeats
  if (licensedProductsArray.length > 0) {
    let totalValue = 0;
    let totalLicensed = 0;
    let totalAssigned = 0;

    // Calculate totals from all licensed products
    licensedProductsArray.forEach((product) => {
      totalValue += product.seats.value || 0;
      totalLicensed += product.seats.licensed;
      totalAssigned += product.seats.assigned;
    });

    // Set the totals
    result.totalSeats.value = totalValue;
    result.totalSeats.assigned = totalAssigned;
    result.totalSeats.licensed = totalLicensed;

    // Calculate valuePerSeat based on licensed products
    if (totalLicensed > 0) {
      result.totalSeats.valuePerSeat = totalValue / totalLicensed;

      // Calculate value of unused seats
      const unusedSeats = Math.max(0, totalLicensed - totalAssigned);
      result.totalSeats.unusedSeatsValue =
        unusedSeats * result.totalSeats.valuePerSeat;
    }
  }
  // Zeros were already set during initialization, so no else needed

  return result;
}

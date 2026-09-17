import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { addContractUsers } from '@/data/superuser/contracts';
import { logUserChanged } from '@/data/superuser/activities';
import { toast } from '@/components/ui/use-toast';
import { getUserMetadata } from '@/data/users';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircledIcon, Cross2Icon, TableIcon } from '@radix-ui/react-icons';
import { VendorProduct } from '@/constants/types';
import { Eye } from 'lucide-react';
import { useCreateBusinessGroup } from '@/hooks/api/useOrgUnits';

interface UploadActiveUsersCSVButtonProps {
  id: number;
  initialUsers: {
    id: number;
    name: string;
    email: string | null;
    product_id?: number | null;
    contract_id?: number | null;
    created_at?: string;
    updated_at?: string | null;
    vendor_products?: {
      id: number;
      name: string;
    } | null;
  }[];
  vendorProducts: VendorProduct[] | undefined;
  loadUsers: () => Promise<void>;
  onClose: () => void;
  defaultProductId?: number;
  orgGroups: Array<{ id: number; name: string }>;
}

interface UserData {
  id?: number;
  name: string;
  email: string | null;
  status?: 'valid' | 'skip' | 'error';
  product_id: number;
  employee_id?: string;
  region?: string;
  country?: string;
  division?: string;
  department?: string;
  cost_center?: string;
  group_name?: string;
  start_date?: string;
  leave_date?: string;
  contract_id?: number | null;
  created_at?: string;
  updated_at?: string | null;
  vendor_products?: {
    id: number;
    name: string;
  };
  message?: string;
}

const UploadActiveUsersCSVButton = ({
  id,
  initialUsers,
  vendorProducts,
  loadUsers,
  onClose,
  defaultProductId,
  orgGroups,
}: UploadActiveUsersCSVButtonProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<UserData[]>([]);
  const [viewUser, setViewUser] = useState<UserData | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>('none');
  const [currentUser, setCurrentUser] = useState<{
    userId?: string;
    userProfile?: { name?: string | null } | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createBusinessGroup = useCreateBusinessGroup();

  useEffect(() => {
    if (uploadSuccess) {
      onClose();
    }
  }, [uploadSuccess, onClose]);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  async function loadCurrentUser() {
    try {
      const userData = await getUserMetadata();
      setCurrentUser({
        userId: userData?.userId,
        userProfile: userData?.userProfile,
      });
    } catch (error) {
      console.warn('Could not load current user:', error);
    }
  }

  const handleFileSelect = (file: File) => {
    if (file.type !== 'text/csv') {
      toast({
        title: 'Error',
        description: 'Please upload a valid CSV file',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = text.split('\n');

      // Track emails within the current CSV to detect duplicates
      const seenEmails = new Set<string>();

      // Process rows and keep track of first occurrences
      const users = rows
        .slice(1)
        .filter((row) => row.trim()) // Skip empty rows
        .map((row) => {
          const [
            name = '',
            email = '',
            employee_id = '',
            region = '',
            country = '',
            division = '',
            department = '',
            cost_center = '',
            business_group = '',
            start_date = '',
            leave_date = '',
          ] = row.split(',');

          const trimmedEmail = email.trim().toLowerCase(); // Normalize emails to lowercase
          const user = validateUser(name, email.trim());

          // Attach optional metadata (keep as raw strings; empty values are omitted)
          user.employee_id = employee_id.trim() || undefined;
          user.region = region.trim() || undefined;
          user.country = country.trim() || undefined;
          user.division = division.trim() || undefined;
          user.department = department.trim() || undefined;
          user.cost_center = cost_center.trim() || undefined;
          user.group_name = business_group.trim() || undefined;
          user.start_date = start_date.trim() || undefined;
          user.leave_date = leave_date.trim() || undefined;

          // Validate date formats
          const invalidStartDate =
            user.status !== 'error' &&
            user.start_date &&
            !validateDate(user.start_date);

          const invalidLeaveDate =
            user.status !== 'error' &&
            user.leave_date &&
            !validateDate(user.leave_date);

          if (invalidStartDate || invalidLeaveDate) {
            user.status = 'error';
            user.message = 'Invalid date format. Date should be YYYY-MM-DD';
          }

          // Validate leave_date is not earlier than start_date
          if (
            user.status !== 'error' &&
            user.start_date &&
            user.leave_date &&
            user.leave_date < user.start_date
          ) {
            user.status = 'error';
            user.message = 'Leave date cannot be earlier than start date';
          }

          // Only mark as duplicate if we've seen this email before
          if (trimmedEmail && seenEmails.has(trimmedEmail)) {
            user.status = 'skip';
            user.message = 'Duplicate email within CSV';
          } else if (trimmedEmail) {
            // Add email to seen set (only if it's a valid email)
            if (validateEmail(trimmedEmail)) {
              seenEmails.add(trimmedEmail);
            }
          }

          return user;
        });

      // Set the preview data
      setPreviewData(users);

      // Then immediately run validation with the current product ID setting
      const productId =
        selectedProduct && selectedProduct !== 'none'
          ? parseInt(selectedProduct, 10)
          : defaultProductId || null;

      const validatedUsers = users.map((user) => {
        // Skip if already invalid from basic validation
        if (user.status === 'error' || user.status === 'skip') {
          return user;
        }

        // Check if user already exists
        if (user.email && isUserWithProductExists(user.email, productId)) {
          return {
            ...user,
            product_id: productId || defaultProductId || 0,
            status: 'skip' as const,
            message: 'User already exists with this product',
          };
        }

        return {
          ...user,
          product_id: productId || defaultProductId || 0,
          status: 'valid' as const,
          message: '',
        };
      });

      setPreviewData(validatedUsers);
    };

    reader.readAsText(file);
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateDate = (date: string) => {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
  };

  // Check if a user with the same email and product_id combination already exists
  const isUserWithProductExists = (
    email: string,
    productId?: number | null,
  ) => {
    // For "All Products" (selectedProduct === "none") with actual vendor products, check if the user exists with ANY product
    if (
      selectedProduct === 'none' &&
      Array.isArray(vendorProducts) &&
      vendorProducts.length > 0
    ) {
      // Get unique product IDs
      const uniqueProductIds = Array.from(
        new Set(vendorProducts.map((p) => p.id)),
      );

      // Check if the user exists for ANY of the products
      return uniqueProductIds.some((pid) =>
        initialUsers.some(
          (user) =>
            user.email?.toLowerCase() === email.toLowerCase() &&
            user.product_id === pid,
        ),
      );
    }

    // For specific product or single-product context (empty vendorProducts with defaultProductId)
    const checkProductId = productId ?? defaultProductId ?? null;
    return initialUsers.some(
      (user) =>
        user.email?.toLowerCase() === email.toLowerCase() &&
        user.product_id === checkProductId,
    );
  };

  const validateUser = (name: string, email: string): UserData => {
    const user: UserData = {
      name: name.trim(),
      email: email.trim(),
      status: 'valid',
      product_id: defaultProductId || 0, // Use defaultProductId for single product contexts
    };

    if (!user.name) {
      user.status = 'error';
      user.message = 'Name is missing';
    } else if (!user.email) {
      user.status = 'error';
      user.message = 'Email is missing';
    } else if (typeof user.email === 'string' && !validateEmail(user.email)) {
      user.status = 'error';
      user.message = 'Invalid email';
    }

    return user;
  };

  // Update the status of users based on the selected product
  useEffect(() => {
    if (previewData.length > 0) {
      const productId =
        selectedProduct && selectedProduct !== 'none'
          ? parseInt(selectedProduct, 10)
          : defaultProductId || null;

      const updatedPreviewData = previewData.map((user) => {
        // First check basic validation (already done in validateUser)
        if (
          user.status === 'error' ||
          (user.status === 'skip' &&
            user.message === 'Duplicate email within CSV')
        ) {
          return user;
        }

        // Then check for duplicates with existing users
        if (user.email && isUserWithProductExists(user.email, productId)) {
          return {
            ...user,
            product_id: productId || defaultProductId || 0,
            status: 'skip' as const,
            message: 'User already exists with this product',
          };
        }

        // Otherwise, the user is valid
        return {
          ...user,
          product_id: productId || defaultProductId || 0,
          status: 'valid' as const,
          message: '',
        };
      });

      setPreviewData(updatedPreviewData);
    }
  }, [selectedProduct, initialUsers]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUploadCSVClick = async () => {
    try {
      setIsUploading(true);

      // Get valid users from preview data
      const validPreviewUsers = previewData.filter(
        (user) => user.status === 'valid',
      );

      if (validPreviewUsers.length === 0) {
        throw new Error('No valid users found in the CSV file');
      }

      // Collect unique group names
      const uniqueGroupNames = Array.from(
        new Set(
          validPreviewUsers
            .map((u) => u.group_name?.trim())
            .filter((n): n is string => !!n),
        ),
      );

      // Seats no longer carry a group, so the names are resolved only to mint
      // the org-unit nodes an employee can later be placed under.
      const knownGroupNames = new Set(
        orgGroups.map((g) => g.name.toLowerCase()),
      );
      for (const name of uniqueGroupNames) {
        if (knownGroupNames.has(name.toLowerCase())) continue;
        const { group } = await createBusinessGroup.mutateAsync(name);
        knownGroupNames.add(group.name.toLowerCase());
      }

      let usersToAdd: Array<{
        contract_id: number;
        name: string;
        email: string;
        created_at: string;
        product_id: number;
        employee_id?: string;
        region?: string;
        country?: string;
        division?: string;
        department?: string;
        cost_center?: string;
        start_date?: string;
        leave_date?: string;
      }> = [];

      // Handle "All Products" (selectedProduct === "none") by creating entries for each unique product
      if (
        selectedProduct === 'none' &&
        Array.isArray(vendorProducts) &&
        vendorProducts.length > 0
      ) {
        // Get unique product IDs to avoid duplicate entries
        const uniqueProductIds = Array.from(
          new Set(vendorProducts.map((p) => p.id)),
        );

        // For each valid user, create an entry for each unique product
        validPreviewUsers.forEach((user) => {
          uniqueProductIds.forEach((productId) => {
            usersToAdd.push({
              contract_id: id,
              name: user.name,
              email: user.email || '', // Ensure email is never null
              created_at: new Date().toISOString(),
              product_id: productId,
              employee_id: user.employee_id,
              region: user.region,
              country: user.country,
              division: user.division,
              department: user.department,
              cost_center: user.cost_center,
              start_date: user.start_date,
              leave_date: user.leave_date,
            });
          });
        });
      } else {
        // For a specific product, create one entry per user
        const productId =
          selectedProduct !== 'none' ? parseInt(selectedProduct, 10) : null;

        usersToAdd = validPreviewUsers.map((user) => ({
          contract_id: id,
          name: user.name,
          email: user.email || '', // Ensure email is never null
          created_at: new Date().toISOString(),
          product_id: productId || defaultProductId || 0, // Use defaultProductId for single product contexts
          employee_id: user.employee_id,
          region: user.region,
          country: user.country,
          division: user.division,
          department: user.department,
          cost_center: user.cost_center,
          start_date: user.start_date,
          leave_date: user.leave_date,
        }));
      }

      await addContractUsers(usersToAdd);

      // Log the bulk user addition for CSV imports
      try {
        const userNames = Array.from(
          new Set(validPreviewUsers.map((user) => user.name)),
        ); // Remove duplicates

        // Get the actual product IDs that were used
        let productIds: number[] = [];
        if (
          selectedProduct === 'none' &&
          Array.isArray(vendorProducts) &&
          vendorProducts.length > 0
        ) {
          // For "All Products", get unique product IDs from vendor products
          productIds = Array.from(new Set(vendorProducts.map((p) => p.id)));
        } else if (selectedProduct !== 'none') {
          // For specific product
          productIds = [parseInt(selectedProduct, 10)];
        }

        if (userNames.length === 1) {
          // Single user
          await logUserChanged({
            contractId: id,
            action: 'added',
            userName: userNames[0],
            productIds,
            changedBy: currentUser?.userId,
          });
        } else {
          // Multiple users - use bulk format
          await logUserChanged({
            contractId: id,
            action: 'added',
            userNames,
            productIds,
            changedBy: currentUser?.userId,
          });
        }
      } catch (logError) {
        console.warn('Failed to log bulk user addition:', logError);
      }
      await loadUsers();

      const skippedCount = previewData.filter(
        (user) => user.status === 'skip' || user.status === 'error',
      ).length;

      // Calculate total users added based on context
      let totalAdded;
      if (
        selectedProduct === 'none' &&
        vendorProducts &&
        vendorProducts.length > 0
      ) {
        // Multi-product context: "All Products" selected - each user gets added to each unique product
        const uniqueProductCount = new Set(vendorProducts.map((p) => p.id))
          .size;
        totalAdded = validPreviewUsers.length * uniqueProductCount;
      } else {
        // Single product context OR specific product selected - each user gets added once
        totalAdded = validPreviewUsers.length;
      }

      const successMessage =
        skippedCount > 0
          ? `${totalAdded} users added successfully (${skippedCount} skipped)`
          : `${totalAdded} users added successfully`;

      toast({ title: 'Success', description: successMessage });
      setUploadSuccess(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Error adding users',
        variant: 'destructive',
      });
      setSelectedFile(null);
      setPreviewData([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setIsUploading(false);
    }
  };

  const getStatusDisplay = (status: UserData['status'], message?: string) => {
    switch (status) {
      case 'valid':
        return '';
      case 'skip':
      case 'error':
        return <span className="italic text-gray-500">{message}</span>;
      default:
        return null;
    }
  };

  const renderField = (label: string, value?: string | null) => (
    <div className="grid grid-cols-3 gap-3 py-2">
      <div className="font-medium text-xs text-muted-foreground">{label}</div>
      <div className="col-span-2 text-sm">
        {value && value.trim() !== '' ? (
          value
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
        className="hidden"
      />

      {!selectedFile ? (
        <div
          className={`rounded-sm border-2 border-dashed px-8 py-20 text-center transition-colors
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-700/20'}
            ${isDragging ? 'cursor-copy' : 'cursor-pointer'}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-2 font-sans">
            <TableIcon className="h-10 w-10 text-gray-700/50" />
            <div className="text-lg">
              Drop your CSV file here, or click to browse
            </div>
            <p className="text-sm text-gray-700">
              Your CSV must have <span className="font-medium">name</span> and{' '}
              <span className="font-medium">email</span> columns
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-sm bg-gray-700/10 py-2 pl-3 pr-2">
          <div className="font-medium flex flex-1 gap-2 font-sans text-sm">
            <span className="border-r-gray/50 whitespace-nowrap border-r pr-2">
              {previewData.length} users
            </span>
            <span className="font-light line-clamp-1 h-5 break-all">
              {selectedFile.name}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedFile(null);
              setPreviewData([]);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          >
            <Cross2Icon className="h-4 w-4" />
          </Button>
        </div>
      )}

      {vendorProducts &&
        vendorProducts.length > 0 &&
        previewData.length > 0 && (
          <div className="mt-2">
            <Select
              value={selectedProduct}
              onValueChange={(value) => {
                setSelectedProduct(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a product (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Select a product</SelectLabel>
                  <SelectSeparator />
                  <SelectItem value="none">All Products</SelectItem>
                  <SelectSeparator />
                  {Array.isArray(vendorProducts) &&
                    Array.from(new Set(vendorProducts.map((p) => p.id)))
                      .map((id) => vendorProducts.find((p) => p.id === id))
                      .filter((p): p is VendorProduct => p !== undefined)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((product) => (
                        <SelectItem
                          key={product.id}
                          value={product.id.toString()}
                        >
                          {product.name}
                        </SelectItem>
                      ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}

      {previewData.length > 0 && (
        <div className="rounded border">
          <ScrollArea className="h-80">
            <div>
              <Table stickyHeader scrollClassName={null}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-2/8">Name</TableHead>
                    <TableHead className="w-2/8">Email</TableHead>
                    <TableHead className="w-2/8">Region</TableHead>
                    <TableHead className="w-3/8">Status</TableHead>
                    <TableHead className="w-1/8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((user, index) => (
                    <TableRow key={index} className="font-sans">
                      <TableCell className="py-2">{user.name}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          {user.status === 'valid' && (
                            <CheckCircledIcon className="text-green-500 h-4 w-4" />
                          )}
                          {(user.status === 'error' ||
                            user.status === 'skip') && (
                            <Cross2Icon className="h-4 w-4 text-pink-600" />
                          )}
                          <span className="break-all">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-sm">
                        {user.region ?? ''}
                      </TableCell>
                      <TableCell className="py-2 text-sm">
                        {getStatusDisplay(user.status, user.message)}
                      </TableCell>
                      <TableCell className="py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setViewUser(user)}
                          aria-label="View row details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </div>
      )}

      <Dialog
        open={!!viewUser}
        onOpenChange={(open) => !open && setViewUser(null)}
      >
        {viewUser && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Imported row details</DialogTitle>
            </DialogHeader>

            <div className="divide-y rounded-sm border px-4">
              {renderField('Name', viewUser.name)}
              {renderField('Email', viewUser.email ?? '')}
              {renderField('Employee ID', viewUser.employee_id)}
              {renderField('Region', viewUser.region)}
              {renderField('Country', viewUser.country)}
              {renderField('Division', viewUser.division)}
              {renderField('Department', viewUser.department)}
              {renderField('Cost Center', viewUser.cost_center)}
              {renderField('Business Group', viewUser.group_name)}
              {renderField('Start Date', viewUser.start_date)}
              {renderField('Leave Date', viewUser.leave_date)}
              {renderField(
                'Status',
                (viewUser.status ? `${viewUser.status}` : '') +
                  (viewUser.message ? ` — ${viewUser.message}` : ''),
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {selectedFile && (
        <div className="flex justify-between">
          <div className="font-label text-xs text-gray-700/70">
            {previewData.filter(
              (user) => user.status === 'skip' || user.status === 'error',
            ).length === previewData.length ? (
              <>No valid users</>
            ) : previewData.filter(
                (user) => user.status === 'skip' || user.status === 'error',
              ).length > 0 ? (
              <>
                Skipping{' '}
                {
                  previewData.filter(
                    (user) => user.status === 'skip' || user.status === 'error',
                  ).length
                }{' '}
                users
              </>
            ) : null}
          </div>

          <Button
            onClick={handleUploadCSVClick}
            disabled={
              isUploading ||
              !previewData.some((user) => user.status === 'valid') ||
              uploadSuccess
            }
          >
            {isUploading
              ? 'Uploading...'
              : 'Upload ' +
                previewData.filter((user) => user.status === 'valid').length +
                ' Users'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default UploadActiveUsersCSVButton;

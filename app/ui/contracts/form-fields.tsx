import { Button } from '@/app/ui/button';
import { MinusCircleIcon, MinusIcon } from '@heroicons/react/20/solid';

export function Input({
  value,
  fieldName,
  placeholder,
  label,
}: {
  value: string;
  fieldName: string;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative mt-6">
      <label htmlFor={fieldName} className="font-medium mb-2 block text-sm">
        {label}
      </label>
      <input
        id={fieldName}
        name={fieldName}
        type="text"
        defaultValue={value}
        placeholder={placeholder}
        className="block w-full rounded-md border border-gray-200 py-2 text-sm outline-2 placeholder:text-gray-500"
      />
    </div>
  );
}

export function TextArea({
  value,
  fieldName,
  placeholder,
  label,
}: {
  value: string;
  fieldName: string;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative mt-6">
      <label htmlFor={fieldName} className="font-medium mb-2 block text-sm">
        {label}
      </label>
      <textarea
        id={fieldName}
        name={fieldName}
        defaultValue={value}
        placeholder={placeholder}
        rows={3}
        className="block w-full rounded-md border border-gray-200 py-2 text-sm outline-2 placeholder:text-gray-500"
      />
    </div>
  );
}

export function Products({
  index,
  name,
  fees,
  onProductChange,
  onRemoveProduct,
}: {
  index: number;
  name: string;
  fees: string;
  onProductChange: (index: number, field: string, value: string) => void;
  onRemoveProduct?: () => void;
}) {
  return (
    <div className="relative mt-6">
      <fieldset className="mb-4">
        <legend className="mb-4 flex items-center gap-4">
          {`Year ${index + 1}`}{' '}
          {onRemoveProduct && (
            <button
              onClick={onRemoveProduct}
              className="font-gtp font-medium flex h-7 items-center rounded-lg bg-blue-500 px-1 text-sm text-white transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50 hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:bg-blue-600"
            >
              <MinusIcon width={24} height={24} />
            </button>
          )}
        </legend>
        <label
          htmlFor={`Product_Name_${index}`}
          className="font-medium mb-2 block text-sm"
        >
          Product Name
        </label>
        <input
          id={`Product_Name_${index}`}
          name={`Product_Name_${index}`}
          type="text"
          value={name}
          onChange={(e) => onProductChange(index, 'name', e.target.value)}
          placeholder="Enter product name"
          className="mb-4 block w-full rounded-md border border-gray-200 py-2 text-sm outline-2 placeholder:text-gray-500"
        />
        <label
          htmlFor={`Product_Fees_${index}`}
          className="font-medium mb-2 block text-sm"
        >
          Product Fees
        </label>
        <input
          id={`Product_Fees_${index}`}
          name={`Product_Fees_${index}`}
          type="text"
          value={fees}
          onChange={(e) => onProductChange(index, 'fees', e.target.value)}
          placeholder="Enter product fees"
          className="block w-full rounded-md border border-gray-200 py-2 text-sm outline-2 placeholder:text-gray-500"
        />
      </fieldset>
    </div>
  );
}

export function RadioInput({
  id,
  name,
  value,
  defaultChecked,
  checked,
  onChange,
  label,
}: {
  id: string;
  name: string;
  value: string | boolean;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center">
      <input
        id={id}
        name={name}
        type="radio"
        value={value.toString()}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 cursor-pointer border-gray-300 bg-gray-100 text-gray-600 focus:ring-2"
      />
      <label
        htmlFor={id}
        className="font-medium flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs"
      >
        {label}
      </label>
    </div>
  );
}

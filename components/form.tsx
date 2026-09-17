import { Controller } from 'react-hook-form';

export function Input({
  register,
  fieldName,
  placeholder,
  label,
  pattern,
  required,
}: {
  fieldName: string;
  placeholder: string;
  label: string;
  register: any;
  pattern: string;
  required?: boolean;
}) {
  return (
    <div className="relative mt-6">
      <label
        htmlFor={fieldName}
        className="font-bold mb-2 block font-sans text-sm"
      >
        {label}
      </label>
      <input
        placeholder={placeholder}
        {...register(fieldName, {
          required: required !== undefined ? required : true,
          pattern,
        })}
        className="block w-full rounded-md border border-gray-200 py-2 text-sm outline-2 placeholder:text-gray-500"
      />
    </div>
  );
}

export function TextArea({
  register,
  fieldName,
  placeholder,
  label,
  pattern,
  required,
}: {
  fieldName: string;
  placeholder: string;
  label: string;
  register: any;
  pattern: string;
  required?: boolean;
}) {
  return (
    <div className="relative mt-6">
      <label
        htmlFor={fieldName}
        className="font-bold mb-2 block font-sans text-sm"
      >
        {label}
      </label>
      <textarea
        placeholder={placeholder}
        rows={4}
        {...register(fieldName, {
          required: required !== undefined ? required : true,
          pattern,
        })}
        className="block w-full rounded-md border border-gray-200 py-2 text-sm outline-2 placeholder:text-gray-500"
      />
    </div>
  );
}

export function Error({ error, field }: { error: any; field: any }) {
  return (
    <>
      {error && (
        <p className="text-red-500">
          {error.type === 'required' &&
            `${field.label || field.name} is required`}
          {error.type === 'pattern' &&
            `Fees must contain numbers only. Example: 10000.`}
        </p>
      )}
    </>
  );
}

export function generateElement({
  field,
  register,
  watch,
  required = false,
  control,
  setValue,
}: {
  field: any;
  register?: any;
  watch?: any;
  required?: boolean;
  control?: any;
  setValue?: any;
}) {
  switch (field.elementType) {
    case 'input':
      return (
        <Input
          register={register}
          placeholder={field.placeholder}
          fieldName={field.fieldName}
          label={field.label}
          pattern={field.pattern}
          required={required}
        />
      );
    case 'textarea':
      return (
        <TextArea
          register={register}
          placeholder={field.placeholder}
          fieldName={field.fieldName}
          label={field.label}
          pattern={field.pattern}
          required={required}
        />
      );
    case 'header':
      return <FormHeader title={field.title} />;
    case 'hr':
      return <FormHr />;
    case 'radio':
      return (
        <RadioInput
          register={register}
          fieldName={field.fieldName}
          options={field.options}
          label={field.label}
          watch={watch}
          placeholder={field.placeholder}
          otherFieldName={field.otherFieldName}
          setValue={setValue}
          suffix={field.suffix}
        />
      );
    case 'dropdown':
      return (
        <DropDown
          register={register}
          fieldName={field.fieldName}
          options={field.options}
          label={field.label}
          watch={watch}
          placeholder={field.placeholder}
          otherFieldName={field.otherFieldName}
          otherInputType={field.otherInputType}
          control={control}
          dataType={field.type}
          addDisabled={field.addDisabled}
          defaultValue={field.defaultValue}
          fieldInfo={field.fieldInfo}
        />
      );
    case 'date':
      return (
        <DateInput
          register={register}
          fieldName={field.fieldName}
          label={field.label}
          placeholder={field.placeholder}
          pattern={field.pattern}
        />
      );
  }
}

export function FormHeader({ title }: { title: string }) {
  return (
    <div className="mb-4">
      <h1 className="font-sans text-2xl tracking-normal">{title}</h1>
    </div>
  );
}

export function FormHr() {
  return <hr className="my-8" />;
}

export function RadioInput({
  register,
  fieldName,
  options,
  label,
  watch,
  placeholder,
  otherFieldName,
  suffix,
  setValue,
}: {
  fieldName: string;
  options: any;
  label: string;
  register: any;
  watch: any;
  placeholder: string;
  otherFieldName: string;
  suffix?: string;
  setValue?: any;
}) {
  const radioOption = watch(fieldName);
  return (
    <>
      <fieldset className="mt-6">
        <legend className="font-bold mb-2 block font-sans text-sm">
          {label}
        </legend>
        <div className="rounded-md border border-gray-200 bg-white px-[14px] py-3">
          <div className="grid grid-cols-4 items-center gap-y-2">
            {options.map((option: string, index: number) => (
              <div key={index} className="flex items-center gap-1.5">
                <input
                  {...register(fieldName, { required: false })}
                  type="radio"
                  value={option}
                  className="h-4 w-4 cursor-pointer border-gray-300 bg-gray-100 text-gray-600 focus:ring-2"
                />
                <label
                  htmlFor={option}
                  className="font-bold flex cursor-pointer items-center gap-1.5 py-1.5 font-sans text-xs"
                >
                  {`${option}  ${suffix && option !== 'Other' ? suffix : ''}`}
                </label>
              </div>
            ))}
          </div>
          {radioOption === 'Other' && (
            <input
              {...register(otherFieldName)}
              placeholder={placeholder}
              className="mt-4 block w-full rounded-md border border-gray-200 py-2 text-sm placeholder:text-gray-500"
            />
          )}
        </div>
      </fieldset>
    </>
  );
}

export function DropDown({
  register,
  fieldName,
  options,
  label,
  watch,
  placeholder,
  otherFieldName,
  otherInputType,
  control,
  dataType,
  addDisabled,
  defaultValue,
  fieldInfo,
}: {
  fieldName: string;
  options: any;
  label: string;
  register: any;
  watch: any;
  placeholder: string;
  otherFieldName: string;
  otherInputType?: string;
  control: any;
  dataType: string;
  addDisabled: boolean;
  defaultValue: any;
  fieldInfo: string;
}) {
  const dropddownOption = watch(fieldName);
  return (
    <>
      <Controller
        name={fieldName}
        control={control}
        defaultValue={defaultValue}
        render={({ field }) => (
          <fieldset className={`mt-6 field-${fieldName}`}>
            <legend className="font-bold mb-2 flex gap-4 font-sans text-sm">
              <span>{label}</span>
              <span className="text-foreground text-opacity-50">
                {fieldInfo}
              </span>
            </legend>
            <div className="flex items-center space-x-4">
              <select
                {...register(fieldName, { required: false })}
                onChange={(e) =>
                  field.onChange(
                    dataType === 'number'
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
                className="flex-grow rounded-md border border-gray-200 py-2 text-sm outline-2"
              >
                {addDisabled && (
                  <option value="" disabled selected>
                    {placeholder}
                  </option>
                )}
                {options.map(
                  (
                    { name, value }: { name: string; value: any },
                    index: number,
                  ) => (
                    <option key={index} value={value}>
                      {name}
                    </option>
                  ),
                )}
              </select>
              {dropddownOption === 'Other' && (
                <div className="flex-grow">
                  <input
                    {...register(otherFieldName, { required: true })}
                    placeholder={placeholder}
                    className="block w-full rounded-md border border-gray-200 py-2 text-sm outline-2 placeholder:text-gray-500"
                    type={otherInputType || 'text'}
                  ></input>
                </div>
              )}
            </div>
          </fieldset>
        )}
      />
    </>
  );
}

export function DateInput({
  register,
  fieldName,
  label,
  placeholder,
  pattern,
}: {
  fieldName: string;
  label: string;
  register: any;
  placeholder: string;
  pattern: string;
}) {
  return (
    <>
      <div className="col-span-1 mt-6">
        <label
          htmlFor={fieldName}
          className="font-bold block font-sans text-sm text-gray-700"
        >
          {label}
        </label>
        <input
          type="date"
          {...register(fieldName, { required: false })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          placeholder={placeholder}
          pattern={pattern}
        />
      </div>
    </>
  );
}

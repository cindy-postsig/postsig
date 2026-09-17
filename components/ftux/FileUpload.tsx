'use client';

import gsap from 'gsap';
import React, {
  useCallback,
  useState,
  useRef,
  useEffect,
  useReducer,
} from 'react';
import { useDropzone } from 'react-dropzone';
import { createClient } from '@/utils/supabase/client';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import { type User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  getVendorName,
  getContractSummary,
  getContractType,
  getProductList,
} from '@/app/lib/actions/openai';
import {
  getContractBasics,
  getContractSpecifics,
} from '@/app/lib/actions/inngest';
import Loading from '@/components/Loading';
import { uploadFileToOpenAiFtux } from '@/app/lib/service';
import { contractTypeIdMap } from '@/app/lib/constants';
import { contractStatuses } from '@/app/lib/constants';
import { uploadFile } from '@/app/lib/actions/supabase_client';
import { uploadFile as uploadFileEvent } from '@/app/lib/actions/contract';
import {
  findVendors,
  insertVendor,
  insertContract,
  insertContractDoc,
  updateUser,
} from '@/app/lib/actions/supabase';
import { useToast } from '@/components/ui/use-toast';
import pMap from 'p-map';
import { generateToastError } from '@/utils/toast';
import { sanitizeFileName } from '@/utils/helpers';

interface FileUploadProps {
  user: any;
}

const FileUpload: React.FC<FileUploadProps> = ({
  user,
}: {
  user: User | null;
}) => {
  const { toast } = useToast();
  if (!user) {
    redirect('/login');
  }
  function reducer(state: any, action: any) {
    switch (action.type) {
      case 'incrementStep':
        return { ...state, step: state.step + 1 };
      case 'startTimer':
        return { ...state, timerOn: true };
      case 'stopTimer':
        return { ...state, timerOn: false };
      case 'startUploadOpenAiFiles':
        return { ...state, uploadOpenAiFiles: true };
      case 'stopUploadOpenAiFiles':
        return { ...state, uploadOpenAiFiles: false };
      case 'addSampleAiData':
        return {
          ...state,
          sampleAiData: { ...state.sampleAiData, ...action.payload },
        };
      default:
        return;
    }
  }
  const supabase = createClient();
  const [ftux, setFtux] = useState<boolean>(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadPercentage, setUploadPercentage] = useState(0);
  const [isUploaded, setIsUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const uploadHeaderRef = useRef<HTMLDivElement>(null);
  const fileGridRef = useRef<HTMLDivElement>(null);
  const initialEmptyDivs = 15;
  const divSettings = 'h-72 rounded-md p-4';
  const initialFtuxStates = {
    step: 1,
    showFtux: false,
    timerOn: false,
    uploadOpenAiFiles: false,
    sampleAiData: {},
  };
  const [ftuxStates, dispatch] = useReducer(reducer, initialFtuxStates);

  const emptyDivs = Array.from({ length: initialEmptyDivs }, (_, index) => (
    <div
      key={index}
      className={`border border-dashed border-neutral-400 ${divSettings}`}
    ></div>
  ));

  let incrementStep = (function () {
    let executed = false;
    return function (timeout: number = 3000) {
      if (!executed) {
        executed = true;
        setTimeout(() => {
          dispatch({ type: 'incrementStep' });
          dispatch({ type: 'stopTimer' });
        }, timeout);
      }
    };
  })();

  const animateFileGrid = () => {
    const fileGridElement = fileGridRef.current;
    const headingElement = headingRef.current;
    const uploadHeaderElement = uploadHeaderRef.current;

    if (fileGridElement && headingElement) {
      const headingHeight = headingElement.offsetHeight;

      gsap.to(headingElement, {
        duration: 0.4,
        opacity: 0,
        onComplete: () => {
          gsap.set(headingElement, { display: 'none' });
          gsap.to(uploadHeaderElement, {
            opacity: 1,
            duration: 0.4,
          });
          gsap.fromTo(
            fileGridElement,
            {
              y: headingHeight,
            },
            {
              duration: 1.2,
              y: 0,
              ease: 'elastic.out(1,1)',
            },
          );
          gsap.to(uploadHeaderElement, {
            delay: 1.2,
            className:
              'sticky top-0 z-10 flex items-center justify-center py-12 upload-header',
          });
        },
      });
    }
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const totalFiles = files.length + acceptedFiles.length;
      if (isUploaded) {
        resetProcess();
        setFiles(acceptedFiles);
      } else {
        setFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);
      }
      animateFileGrid();
    },
    [files, isUploaded],
  );

  // Reset upload process
  const resetProcess = () => {
    setIsUploaded(false);
    setUploadPercentage(0);
  };

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: {
      'application/pdf': ['.pdf'],
    },
  });

  const getUser = useCallback(async () => {
    if (!user) {
      redirect('/login');
    }

    try {
      const { data, error, status } = await supabase
        .from('users')
        .select(`show_ftux`)
        .eq('id', user?.id)
        .single();

      if (error && status !== 406) {
        throw error;
      }

      if (data) {
        setFtux(false);
      }
    } catch (error: any) {
      toast(generateToastError(error.message, 'Error loading user data'));
    } finally {
    }
  }, [user]);

  useEffect(() => {
    getUser();
  }, [JSON.stringify(user), ftuxStates?.uploadOpenAiFiles]);

  async function updateUserData({ ftux }: { ftux: boolean }) {
    if (!user) {
      redirect('/login');
    }
    const show_ftux = Boolean(ftux); // Convert ftux to boolean
    await updateUser({
      // @ts-ignore
      show_ftux,
      updated_at: new Date().toISOString(),
    });
  }

  // Upload files to the backend
  const uploadFiles = async () => {
    if (files.length < 1) {
      return;
    }
    setUploading(true);
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('file', file);
    });

    try {
      await pMap(
        files,
        async (file, index) => {
          const sanitizedFileName = sanitizeFileName(file.name);
          const filePath = `${user?.id}/${sanitizedFileName}`;

          if (index === 0) {
            // Step 1: Upload the contract file
            await uploadFile(file, filePath); // Step 1: Upload the contract file

            // Open AI upload
            const openAiFile = await uploadFileToOpenAiFtux(file);
            const { data: vendor_name } = await getVendorName(openAiFile.id);
            dispatch({
              type: 'addSampleAiData',
              payload: {
                fileName: file.name,
                ...vendor_name,
              },
            });

            dispatch({ type: 'incrementStep' });

            const { data: contract_type } = await getContractType(
              openAiFile.id,
            );
            dispatch({
              type: 'addSampleAiData',
              payload: {
                ...ftuxStates.sampleAiData,
                ...contract_type,
              },
            });

            dispatch({ type: 'incrementStep' });

            const { data: products_list } = await getProductList(openAiFile.id);
            dispatch({
              type: 'addSampleAiData',
              payload: {
                ...ftuxStates.sampleAiData,
                ...products_list,
              },
            });

            dispatch({ type: 'incrementStep' });

            const { data: summary } = await getContractSummary(openAiFile.id);
            dispatch({
              type: 'addSampleAiData',
              payload: {
                ...ftuxStates.sampleAiData,
                ...summary,
              },
            });

            dispatch({ type: 'incrementStep' });

            dispatch({
              type: 'addSampleAiData',
              payload: {
                fileName: file.name,
                ...vendor_name,
                ...summary,
                ...products_list,
                ...contract_type,
              },
            });

            let vendorId = null;
            if (vendor_name?.vendor_name) {
              const existingVendors = await findVendors(
                vendor_name?.vendor_name,
              );

              if (existingVendors.length > 0) {
                // TODO: Think about how to handle multiple vendors, with a modal perhaps
                vendorId = (existingVendors[0] as any).id;
              } else {
                const vendorData = await insertVendor(vendor_name?.vendor_name);

                if (vendorData) {
                  vendorId = (vendorData as any).id;
                } else {
                  throw new Error('Vendor insert failed.');
                }
              }
            }

            // Step 2: Insert into the contracts table
            let contractData = await insertContract({
              user_id: user?.id,
              updated_at: new Date().toISOString(),
              open_ai_file_id: openAiFile.id,
              status_id:
                index === 0 ? contractStatuses.uploaded : contractStatuses.new,
              summary: summary?.contract_summary,
              type_id: contractTypeIdMap[contract_type?.contract_type],
              products_fees: [{ summary: products_list }],
              vendor_id: vendorId, // This can be null
            });

            if (!contractData) {
              throw new Error(
                'No contract data returned from insert operation.',
              );
            }

            const contractId = (contractData as any).id;

            const contractColumns = ['contract_summary', 'contract_type'];

            if (index !== 0) {
              contractColumns.push('vendor_name');
            }

            getContractSpecifics({
              fileId: openAiFile.id,
              contractId,
              eventName: 'contracts/specs',
              columns: contractColumns,
              userId: user?.id,
            });
            await getContractBasics(
              contractId,
              openAiFile.id,
              'contracts/basics',
            );

            // Step 3: Insert into the contract_documents table
            await insertContractDoc({
              file_path: filePath,
              updated_at: new Date().toISOString(),
              contract_id: contractId,
            });
          } else {
            uploadFileEvent(file, file.name);
          }
          return filePath;
        },
        { concurrency: 3 },
      );

      await updateUserData({ ftux });

      setIsUploaded(true);
      dispatch({ type: 'startUploadOpenAiFiles' });
      setUploadPercentage(100);
      setUploading(false);
    } catch (err: any) {
      toast(generateToastError(err.message, 'File upload error!'));
      setIsUploaded(false);
      setUploading(false);
    }
  };

  // Remove a file from the list
  const removeFile = (fileToRemove: File) => {
    setFiles(files.filter((file) => file !== fileToRemove));
  };

  if (ftuxStates?.step === 2) {
    if (files.length > 1) {
      setFiles(files.slice(0, 1));
    }
    dispatch({ type: 'incrementStep' });
  }

  if (ftuxStates?.step === 3 && ftuxStates?.timerOn === false) {
    const fileGridElement = fileGridRef.current;
    gsap.to(fileGridElement, {
      duration: 1,
      x: '25vw',
      y: '7vh',
      translateX: '-50%',
      translateY: '-50%',
    });
  }

  // Step 1: Select files
  // Step 2: Upload files & show only one
  // Step 3: Bring the single file box to the middle
  // Step 4: Show vendor & contract type
  // Step 5: Show suummary
  // Step 6: Show products and fees / dashboard button

  return (
    <div
      className={`h-screen px-8 ${files.length < 1 ? 'overflow-y-hidden' : 'overflow-y-visible'}`}
    >
      <div {...getRootProps({ className: 'dropzone h-full' })}>
        <div
          id="Heading"
          ref={headingRef}
          className="flex flex-col justify-center gap-6 pt-32 text-center font-serif text-xl"
        >
          <h1 className="text-5xl">
            Welcome to PostSig, {user?.user_metadata?.full_name?.split(' ')[0]}
          </h1>
          <div className="mx-auto flex max-w-xl flex-col items-center gap-6">
            <p>
              To use PostSig, start by uploading a few documents.
              <br />
              You can drop them into this window or browse your files below.
            </p>

            <p>We only accept PDF documents.</p>
            <button
              className="mt-3 rounded-sm bg-blue-950 px-7 py-3 font-label text-base text-white"
              disabled={uploading}
              onClick={open}
            >
              Browse Documents
            </button>
          </div>
        </div>

        <input {...getInputProps()} />

        <div
          id="uploadHeader"
          ref={uploadHeaderRef}
          className="sticky top-0 z-10 flex items-center justify-center py-12 opacity-0"
        >
          <div className="flex w-full max-w-7xl items-center justify-between">
            {ftuxStates?.step < 3 && (
              <>
                <h2 className="font-serif text-3xl">
                  {files.length > 0 ? 'Perfect!' : ''} You&apos;ve selected{' '}
                  {files.length} document
                  {files.length !== 1 ? 's' : ''}
                </h2>
              </>
            )}
            {ftuxStates?.step > 2 && (
              <>
                <h2 className="font-serif text-3xl">
                  Let&apos;s take a look at <br />
                  one of your documents
                </h2>
              </>
            )}
            {ftuxStates?.step < 3 && (
              <div className="flex items-center gap-4">
                {!uploading && !isUploaded && (
                  <button
                    className="w-48 rounded-sm border border-blue-950 py-3 font-label text-base text-blue-950"
                    disabled={uploading}
                    onClick={open}
                  >
                    Add Documents
                  </button>
                )}
                <button
                  className="w-48 rounded-sm border border-blue-950 bg-blue-950 py-3 font-label text-base text-white disabled:opacity-50"
                  onClick={() => uploadFiles()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading ...' : 'Upload'}
                </button>
              </div>
            )}
            {ftuxStates?.step === 6 && (
              <Link href="/dashboard">
                <button className="rounded border border-blue-950 bg-blue-950 px-5 py-3 font-label text-base text-white">
                  Continue to Dashboard
                </button>
              </Link>
            )}
          </div>
        </div>

        <div id="fileGrid" ref={fileGridRef} className="flex justify-center">
          <div className="relative grid w-full max-w-7xl grid-cols-2 gap-5 pb-24 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {files.length < 1
              ? emptyDivs
              : files.map((file, index) => (
                  <div
                    key={index}
                    className={`flex flex-col border border-transparent bg-white ${divSettings} ${ftuxStates?.step > 2 ? 'h-[34rem] w-[28rem] p-8 transition-all duration-500 ease-in-out' : 'justify-between'}`}
                  >
                    <div
                      className={`flex ${ftuxStates?.step < 3 ? 'justify-between' : 'justify-end'} `}
                    >
                      {ftuxStates?.step < 3 && (
                        <>
                          <p className="font-serif text-3xl text-foreground text-opacity-40">
                            {index + 1}
                          </p>

                          {!isUploaded && !uploading && (
                            <button
                              type="button"
                              onClick={() => removeFile(file)}
                              disabled={isUploaded || uploading}
                            >
                              <XMarkIcon
                                width={24}
                                height={24}
                                className="text-foreground text-opacity-50"
                              />
                            </button>
                          )}
                        </>
                      )}
                      {uploading && <Loading />}
                    </div>
                    {ftuxStates?.step === 3 && (
                      <div
                        id="filename"
                        className={`duration-2000 font-label leading-tight transition-opacity ${ftuxStates?.step === 3 ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <p className="mb-2 text-xs uppercase tracking-wide">
                          Vendor
                        </p>
                        <p className="text-2xl text-foreground">
                          {ftuxStates.sampleAiData.vendor_name}
                        </p>
                      </div>
                    )}
                    {ftuxStates?.step === 4 && (
                      <div
                        id="filename"
                        className={`duration-2000 font-label leading-tight transition-opacity ${ftuxStates?.step === 4 ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <p className="mb-4 text-2xl">
                          {ftuxStates.sampleAiData.vendor_name}
                        </p>
                        <p className="mb-2 text-xs uppercase tracking-wide">
                          Contract Type
                        </p>
                        <p className="text-md  text-foreground">
                          {contractTypeIdMap[
                            ftuxStates.sampleAiData.contract_type
                          ] || ftuxStates.sampleAiData.contract_type}
                        </p>
                      </div>
                    )}
                    {ftuxStates?.step === 5 && (
                      <div
                        id="filename"
                        className={`duration-2000 font-label leading-tight transition-opacity ${ftuxStates?.step === 5 ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <p className="mb-4 text-2xl">
                          {ftuxStates.sampleAiData.vendor_name}
                        </p>
                        <p className="mb-2 text-xs uppercase tracking-wide">
                          Products And Fees
                        </p>
                        <p className="text-md  text-foreground">
                          {ftuxStates.sampleAiData.products_list}
                        </p>
                      </div>
                    )}
                    {ftuxStates?.step === 6 && (
                      <div
                        id="filename"
                        className={`duration-2000 font-label leading-tight transition-opacity ${ftuxStates?.step === 6 ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <p className="mb-4 text-2xl">
                          {ftuxStates.sampleAiData.vendor_name}
                        </p>
                        <p className="mb-2 text-xs uppercase tracking-wide">
                          Contract Summary
                        </p>
                        <p className="text-md line-clamp-[17] font-serif leading-normal text-foreground">
                          {ftuxStates.sampleAiData.contract_summary}
                        </p>
                      </div>
                    )}
                    {ftuxStates?.step < 3 && (
                      <div id="filename" className="font-label leading-tight">
                        <p className="mb-2">
                          {file.name
                            .replace(/_/g, ' ')
                            .split('.')
                            .slice(0, -1)
                            .join('.')}
                        </p>
                        <p className="text-foreground text-opacity-40">PDF</p>
                      </div>
                    )}
                  </div>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;

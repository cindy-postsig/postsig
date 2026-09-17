'use client';

import gsap from 'gsap';
import React, {
  useCallback,
  useState,
  useRef,
  useEffect,
  useReducer,
  useContext,
  useMemo,
} from 'react';
import { useDropzone } from 'react-dropzone';
import { fetchContractsById } from '@/app/lib/contracts/actions';
import { createClient } from '@/utils/supabase/client';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Loading from '@/components/Loading';
import { contractTypeMap } from '@/app/lib/constants';
import { UserContext } from '@/app/userProvider';
import ProductsLicensed from '../contracts/ProductsLicensedFtux';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { Button } from '../ui/button';
// Docusign
import { Loader2 } from 'lucide-react';
import { DocuSignService } from '@/lib/api/docusign';
import DocuSignBrowser from '@/components/DocuSignBrowser';
import { AppDocuSignDocument } from '@/lib/api/docusign';
import { fetchDocuSignStatus as fetchDocuSignStatusUtils } from '@/lib/docusign/utils';

const isDocuSignEnabled = process.env.DOCUSIGN_ENABLED === 'true';
// End of Docusign

interface FileUploadProps {
  user: any;
}

const FileUpload: React.FC<FileUploadProps> = ({ user }: { user: any }) => {
  const userContext = useContext(UserContext);
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
  const [docuSignConnected, setDocuSignConnected] = useState(false);
  const [docuSignPopup, setDocuSignPopup] = useState<Window | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDocuSignBrowser, setShowDocuSignBrowser] = useState(false);
  const [docuSignDocuments, setDocuSignDocuments] = useState<
    AppDocuSignDocument[]
  >([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [downloadingDocuments, setDownloadingDocuments] = useState<
    Record<string, boolean>
  >({});
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [isPageReady, setIsPageReady] = useState(false);
  const docuSignService = useMemo(() => new DocuSignService(), []);
  const headingRef = useRef<HTMLDivElement>(null);
  const uploadHeaderRef = useRef<HTMLDivElement>(null);
  const fileGridRef = useRef<HTMLDivElement>(null);
  const filePondRef = useRef<any>(null);
  const popupPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
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

  const vendorNameStyle = 'mb-8 text-[1.75em] font-serif leading-none';

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

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function timerFunction() {
    await delay(3000);
  }

  // Upload files to the backend
  const uploadFiles = async () => {
    setUploading(true);
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('file', file);
    });

    const demoContractId = 36;

    try {
      const contracts = await fetchContractsById({
        ids: [demoContractId],
      });

      if (!contracts || contracts.length === 0) {
        throw new Error('No contracts found');
      }

      const contract = contracts[0];

      // const products =
      // contracts &&
      // contracts[0]?.vendor_products_details.map((product) => {
      //   return {
      //     name: product?.vendor_products?.name,
      //     year: product.year,
      //     fees: product.fees,
      //   };
      // });

      if (!contract) {
        throw new Error('No contract found');
      }

      await updateDemoContractStatus(demoContractId);

      await timerFunction();
      dispatch({
        type: 'addSampleAiData',
        payload: {
          fileName: files[0].name,
          vendor_name: contract?.vendors?.name,
        },
      });
      dispatch({ type: 'incrementStep' });
      await timerFunction();
      dispatch({
        type: 'addSampleAiData',
        payload: {
          ...ftuxStates.sampleAiData,
          contract_type: contract?.contract_types?.name,
        },
      });
      dispatch({ type: 'incrementStep' });
      await timerFunction();
      dispatch({
        type: 'addSampleAiData',
        payload: {
          ...ftuxStates.sampleAiData,
          vendor_products_details: contract,
        },
      });
      dispatch({ type: 'incrementStep' });
      await timerFunction();
      dispatch({
        type: 'addSampleAiData',
        payload: {
          ...ftuxStates.sampleAiData,
          contract_summary: contract?.summary,
        },
      });
      dispatch({ type: 'incrementStep' });

      setIsUploaded(true);
      dispatch({ type: 'startUploadOpenAiFiles' });
      setUploadPercentage(100);
      //setFiles([]);
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
      x: '24vw',
      y: '5vh',
      translateX: '-50%',
      translateY: '-50%',
    });
    // incrementStep();
    // dispatch({ type: 'startTimer' });
  }

  const updateDemoContractStatus = async (contractId: number) => {
    try {
      const response = await fetch('/api/contracts/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractIds: [contractId],
          status: 'active',
          updateStatusOnly: true,
        }),
      });
      if (!response.ok) throw new Error('Failed to update demo contract');
      const result = await response.json();
    } catch (error) {
      console.error('Error updating demo contract status:', error);
    }
  };

  // Start of DocuSign
  const fetchDocuSignStatus = useCallback(async () => {
    try {
      const isConnected = await fetchDocuSignStatusUtils(supabase, user.userId);
      setDocuSignConnected(isConnected);
      return isConnected;
    } catch (error: any) {
      console.error('Error checking DocuSign connection:', error);
      return false;
    }
  }, [supabase, user.userId]);

  const fetchDocuSignDocuments = useCallback(async () => {
    if (!isDocuSignEnabled) return;
    try {
      setLoadingDocuments(true);
      const { data, error } = await docuSignService.listDocuments();

      if (error) {
        throw error;
      }

      const documentsWithUniqueId = (data?.documents || []).map((doc) => ({
        ...doc,
        appUniqueId: `${doc.envelopeId}-${doc.documentId}`,
      }));

      setDocuSignDocuments(documentsWithUniqueId);
    } catch (error: any) {
      console.error('Error fetching DocuSign documents:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch DocuSign documents',
      });
    } finally {
      setLoadingDocuments(false);
    }
  }, [docuSignService, toast]);

  useEffect(() => {
    setIsPageReady(true);
    if (isDocuSignEnabled) {
      fetchDocuSignStatus();
    }
  }, [fetchDocuSignStatus]);

  const openDocuSignBrowser = useCallback(() => {
    if (!isDocuSignEnabled) return;
    setShowDocuSignBrowser(true);
    fetchDocuSignDocuments();
  }, [fetchDocuSignDocuments]);

  // DocuSign auto-open
  useEffect(() => {
    if (
      isDocuSignEnabled &&
      typeof window !== 'undefined' &&
      docuSignConnected
    ) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openDocuSign') === 'true') {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('openDocuSign');
        window.history.replaceState({}, '', newUrl);
        setTimeout(() => {
          openDocuSignBrowser();
        }, 500);
      }
    }
  }, [docuSignConnected, openDocuSignBrowser]);

  // Effect to poll for DocuSign status when popup is open
  useEffect(() => {
    if (isDocuSignEnabled && docuSignPopup) {
      popupPollIntervalRef.current = setInterval(async () => {
        try {
          if (docuSignPopup.closed) {
            if (popupPollIntervalRef.current) {
              clearInterval(popupPollIntervalRef.current);
            }
            setDocuSignPopup(null);
            return;
          }

          const isConnected = await fetchDocuSignStatus();

          if (isConnected) {
            if (popupPollIntervalRef.current) {
              clearInterval(popupPollIntervalRef.current);
            }
            docuSignPopup.close();
            setDocuSignPopup(null);
            toast({
              title: 'DocuSign Connected',
              description: 'Your account is now connected.',
            });
          }
        } catch (error) {
          console.error('Error during DocuSign polling:', error);
        }
      }, 1000);
    }

    return () => {
      if (popupPollIntervalRef.current) {
        clearInterval(popupPollIntervalRef.current);
      }
    };
  }, [docuSignPopup, fetchDocuSignStatus, toast]);

  const handleAddDocumentsClick = () => {
    if (filePondRef.current) {
      filePondRef.current.browse();
    }
  };

  const connectDocuSign = async () => {
    if (!isDocuSignEnabled) return;
    try {
      setLoading(true);
      const returnUrl = window.location.pathname + window.location.search;
      const returnUrlObj = new URL(window.location.origin + returnUrl);
      returnUrlObj.searchParams.set('openDocuSign', 'true');
      const enhancedReturnUrl = returnUrlObj.pathname + returnUrlObj.search;

      const { data, error } =
        await docuSignService.getAuthUrl(enhancedReturnUrl);
      if (error) throw error;
      if (!data?.url) throw new Error('Failed to get DocuSign auth URL.');

      const popup = window.open(
        data.url,
        'docusign_auth',
        'width=600,height=700,menubar=no,toolbar=no,location=no,status=no',
      );
      setDocuSignPopup(popup);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to initiate DocuSign connection: ${error.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDocuSignUpload = () => {
    if (!isDocuSignEnabled) return;

    if (!docuSignConnected) {
      connectDocuSign();
      return;
    }

    openDocuSignBrowser();
  };

  const handleDocumentSelect = useCallback((id: string, selected: boolean) => {
    setSelectedDocuments((prev) => {
      let newSelected = [...prev];
      const index = newSelected.indexOf(id);
      const isCurrentlySelected = index !== -1;
      if (selected && !isCurrentlySelected) {
        newSelected.push(id);
        return newSelected;
      } else if (!selected && isCurrentlySelected) {
        newSelected.splice(index, 1);
        return newSelected;
      }
      return prev;
    });
  }, []);

  const importSelectedDocuments = useCallback(async () => {
    if (!isDocuSignEnabled) return;

    if (selectedDocuments.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Documents Selected',
        description: 'Please select at least one document to import',
      });
      return;
    }

    const selectedDocs = docuSignDocuments.filter((doc) =>
      selectedDocuments.includes(doc.appUniqueId),
    );

    const newFiles = selectedDocs.map((doc) => {
      const fileData = JSON.stringify({
        documentId: doc.documentId,
        envelopeId: doc.envelopeId,
        name: doc.name,
        isDocuSign: true,
      });
      return new File([fileData], doc.name, { type: 'application/pdf' });
    });

    setFiles((prev) => [...prev, ...newFiles]);

    if (files.length === 0 && newFiles.length > 0) {
      animateFileGrid();
    }

    toast({
      title: 'Documents Added',
      description: `Added ${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''} to the upload queue`,
    });

    setShowDocuSignBrowser(false);
  }, [docuSignDocuments, selectedDocuments, files, toast]);

  useEffect(() => {
    if (!showDocuSignBrowser) {
      setSelectedDocuments([]);
    }
  }, [showDocuSignBrowser]);

  // End of DocuSign

  // if (ftuxStates?.step === 4 && ftuxStates?.timerOn === false) {
  //   // incrementStep();
  //   dispatch({ type: 'startTimer' });
  // }

  // if (ftuxStates?.step === 4 && ftuxStates?.timerOn === false) {
  //   // incrementStep(5000);
  //   dispatch({ type: 'startTimer' });
  // }

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
          <h1 className="text-5xl">Document Upload</h1>
          <div className="mx-auto flex max-w-xl flex-col items-center gap-6">
            <p>
              To use PostSig, start by uploading a few documents.
              <br />
              You can drop them into this window or browse your files below.
            </p>

            <p>We only accept PDF documents.</p>
            <div className="mt-3 flex gap-4">
              <Button
                className="text-base"
                size={'lg'}
                disabled={uploading}
                onClick={open}
              >
                Browse Documents
              </Button>
              {isDocuSignEnabled && (
                <Button
                  className={'text-base'}
                  size={'lg'}
                  onClick={handleDocuSignUpload}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : docuSignConnected ? (
                    'Import from DocuSign'
                  ) : (
                    'Connect DocuSign'
                  )}
                </Button>
              )}
            </div>
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
                  <>
                    <Button
                      className="h-12 w-48 text-base"
                      variant={'outline'}
                      disabled={uploading}
                      onClick={open}
                    >
                      Add Documents
                    </Button>
                    {isDocuSignEnabled && (
                      <Button
                        variant={'outline'}
                        className="h-12 text-base"
                        size={'lg'}
                        onClick={handleDocuSignUpload}
                        disabled={loading}
                      >
                        {loading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : docuSignConnected ? (
                          'Import from DocuSign'
                        ) : (
                          'Connect DocuSign'
                        )}
                      </Button>
                    )}
                  </>
                )}
                <Button
                  className="h-12 w-48 text-base"
                  onClick={uploadFiles}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading ...' : 'Upload'}
                </Button>
              </div>
            )}
            {ftuxStates?.step === 6 && (
              <Link href="/dashboard">
                <button className="font-medium h-12 rounded border bg-primary px-5 font-sans text-base text-primary-foreground">
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
                    className={`flex flex-col border border-transparent bg-card ${divSettings} ${ftuxStates?.step > 2 ? 'h-[36rem] w-[30rem] p-8 transition-all duration-500 ease-in-out' : 'justify-between'}`}
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
                        <p className={vendorNameStyle}>
                          {ftuxStates.sampleAiData.vendor_name}
                        </p>
                      </div>
                    )}
                    {ftuxStates?.step === 4 && (
                      <div
                        id="filename"
                        className={`duration-2000 font-label leading-tight transition-opacity ${ftuxStates?.step === 4 ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <p className={vendorNameStyle}>
                          {ftuxStates.sampleAiData.vendor_name}
                        </p>
                        <p className="mb-2 text-xs uppercase tracking-wide">
                          Contract Type
                        </p>
                        <p className="text-md  text-foreground">
                          {contractTypeMap[
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
                        <p className={vendorNameStyle}>
                          {ftuxStates.sampleAiData.vendor_name}
                        </p>
                        <p className="mb-2 text-xs uppercase tracking-wide">
                          Products And Fees
                        </p>
                        {/* <p className="text-md  text-foreground">
                          {ftuxStates.sampleAiData.products_list}
                        </p> */}
                        <ProductsLicensed
                          data={ftuxStates.sampleAiData.vendor_products_details}
                        />
                      </div>
                    )}
                    {ftuxStates?.step === 6 && (
                      <div
                        id="filename"
                        className={`duration-2000 font-label leading-tight transition-opacity ${ftuxStates?.step === 6 ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <p className={vendorNameStyle}>
                          {ftuxStates.sampleAiData.vendor_name}
                        </p>
                        <p className="mb-2 text-xs uppercase tracking-wide">
                          Contract Summary
                        </p>
                        <p className="line-clamp-[18] font-serif text-[.95em] leading-normal text-foreground">
                          {ftuxStates.sampleAiData.contract_summary}
                        </p>
                      </div>
                    )}
                    {/* {ftuxStates?.step === 4 && (
                      <div
                        id="filename"
                        className={`duration-2000 font-label leading-tight transition-opacity ${ftuxStates?.step === 4 ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <p className="mb-2">
                          {ftuxStates.sampleAiData.vendor_name}
                        </p>
                        <p className="text-foreground text-opacity-40">
                          {ftuxStates.sampleAiData.contract_summary}
                        </p>
                      </div>
                    )}
                    {ftuxStates?.step === 5 && (
                      <div
                        id="filename"
                        className={`duration-2000 font-label leading-tight transition-opacity ${ftuxStates?.step === 5 ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <p className="mb-2">
                          {ftuxStates.sampleAiData.vendor_name}
                        </p>
                        <p className="mb-2 uppercase">Products and Fees</p>
                        <p className="text-foreground text-opacity-40">
                          {ftuxStates.sampleAiData.products_list}
                        </p>
                      </div>
                    )} */}
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
      {isDocuSignEnabled && (
        <DocuSignBrowser
          isOpen={showDocuSignBrowser}
          onOpenChange={setShowDocuSignBrowser}
          isLoading={loadingDocuments}
          documents={docuSignDocuments}
          selectedDocuments={selectedDocuments}
          downloadingDocuments={downloadingDocuments}
          onFetchDocuments={fetchDocuSignDocuments}
          onSelectDocument={handleDocumentSelect}
          onImportSelected={importSelectedDocuments}
        />
      )}
    </div>
  );
};

export default FileUpload;

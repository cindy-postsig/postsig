import {
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

type NoteCardProps = {
  title: string;
  text: string;
};

const NoteCard: React.FC<NoteCardProps> = ({ title, text }: NoteCardProps) => {
  return (
    <div className="">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-row items-center gap-2 text-sm">
          <span className="text-primary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="13"
              viewBox="0 0 16 13"
              fill="none"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M14.1395 1.75675H0V0H16V4.56755H0V2.8108H14.1395V1.75675Z"
                fill="currentColor"
              />
              <path
                d="M16 7.3784H1.86047V8.43245H16V13H0V11.2432H14.1395V10.1892H0V5.62165H16V7.3784Z"
                fill="currentColor"
              />
            </svg>
          </span>
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <p className="relaxed font-serif">{text}</p>
      </CardContent>
    </div>
  );
};

export default NoteCard;

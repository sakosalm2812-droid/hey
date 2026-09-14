import ForgeBlock from "./ForgeBlock";

import {
  Bot,
  Sparkles,
  Workflow,
} from "lucide-react";


const templates = [
  {
    title:"Personal Assistant",
    description:
    "Create an AI that understands your daily life.",
    icon:<Bot size={22}/>,
  },

  {
    title:"Creative Agent",
    description:
    "Build an intelligence focused on creating.",
    icon:<Sparkles size={22}/>,
  },

  {
    title:"Workflow Agent",
    description:
    "Automate repeated processes and systems.",
    icon:<Workflow size={22}/>,
  },
];


export default function AgentTemplate(){

  return (

    <div
      style={{
        display:"grid",

        gridTemplateColumns:
        "repeat(3,1fr)",

        gap:20,
      }}
    >

      {
        templates.map((item)=>(
          <ForgeBlock
            key={item.title}
            {...item}
          />
        ))
      }

    </div>

  );
}
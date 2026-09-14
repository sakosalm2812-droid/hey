import { motion } from "framer-motion";
import {
  Mic,
  Brain,
  Orbit,
  Hammer,
  Sparkles,
  Bot
} from "lucide-react";

import allAgents from "../../agents/agents.js";

import styles from "./Features.module.css";


const features = [

{
icon:Mic,
title:"HEY Voice",
text:"A natural voice interface that lets you communicate with your intelligence instantly."
},

{
icon:Brain,
title:"Memory",
text:"HEY remembers what matters and becomes more personal over time."
},

{
icon:Orbit,
title:"The Cosmos",
text:"A living second brain where your ideas, knowledge, and experiences connect."
},

{
icon:Hammer,
title:"The Forge",
text:"Create custom AI agents and systems designed around your life."
},

{
icon:Bot,
title:`${allAgents.length} Agent Definitions`,
text:"Specialized roles for creation, learning, and problem solving. A role runs only when a verified execution provider is configured."
},

{
icon:Sparkles,
title:"Customization",
text:"Transform HEY into an experience that feels completely yours."
}

];


export default function Features(){

return (

<main className={styles.page}>


<section className={styles.hero}>


<motion.h1

initial={{opacity:0,y:40}}

animate={{opacity:1,y:0}}

>

Everything your

<br/>

intelligence can become.

</motion.h1>


<p>

HEY combines voice, memory, creativity,
and intelligence into one personal system. Provider-backed and native actions
show an unavailable state until their real service or platform adapter is configured.

</p>


</section>




<section className={styles.grid}>


{features.map((item)=>{


const Icon=item.icon;


return (

<motion.article

key={item.title}

className={styles.card}

whileHover={{
y:-10,
scale:1.02
}}

>


<div className={styles.icon}>

<Icon size={32}/>

</div>


<h2>

{item.title}

</h2>


<p>

{item.text}

</p>


</motion.article>

)


})}


</section>


</main>

);

}

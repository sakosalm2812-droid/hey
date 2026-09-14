import { Palette, Sparkles, Layers } from "lucide-react";
import { motion } from "framer-motion";

import Section from "../Section/Section";

import styles from "./CustomizationSection.module.css";


const themes = [

{
icon:Palette,
title:"Colors",
text:"Choose the atmosphere of your intelligence."
},

{
icon:Layers,
title:"Materials",
text:"Glass, crystal, nature, and futuristic worlds."
},

{
icon:Sparkles,
title:"Experiences",
text:"Make HEY feel uniquely yours."
}

];


export default function CustomizationSection(){


return (

<Section>


<div className={styles.wrapper}>


<motion.h2

initial={{
opacity:0,
y:40
}}

whileInView={{
opacity:1,
y:0
}}

viewport={{
once:true
}}

>

Your intelligence.

<br/>

Your identity.

</motion.h2>



<p className={styles.subtitle}>

Change how HEY looks, feels, and evolves around you.

</p>




<div className={styles.preview}>


<div className={styles.window}>

HEY

</div>


</div>




<div className={styles.grid}>


{themes.map((item)=>{


const Icon=item.icon;


return (

<motion.article

key={item.title}

className={styles.card}

whileHover={{
y:-10
}}

>


<Icon size={30}/>


<h3>

{item.title}

</h3>


<p>

{item.text}

</p>


</motion.article>

)


})}


</div>



</div>


</Section>

)

}
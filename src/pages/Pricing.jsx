import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import styles from "./Pricing.module.css";


const plans = [

{
name:"Free",
price:"$0",
description:"Experience the foundation of HEY.",
features:[
"AI conversations",
"Basic memory",
"Core features"
]
},


{
name:"Pro",
price:"$15",
description:"Planned monthly price. Enrollment opens when secure billing is configured.",
features:[
"Advanced memory",
"Customization themes",
"More AI power",
"Personal systems"
],
popular:true
},


{
name:"Elite",
price:"$45",
description:"Planned monthly price. Enrollment opens when secure billing is configured.",
features:[
"Elite customization",
"Exclusive experiences",
"Maximum intelligence",
"Future features"
]
}

];


export default function Pricing(){
const navigate = useNavigate();

return (

<main className={styles.page}>


<section className={styles.hero}>


<motion.h1

initial={{opacity:0,y:40}}

animate={{opacity:1,y:0}}

>

Choose your

<br/>

intelligence.

</motion.h1>


<p>Start with the available Free plan. Paid plans are not offered until billing is securely configured.</p>


</section>




<section className={styles.plans}>


{plans.map((plan)=>{


return (

<motion.article

key={plan.name}

className={`${styles.card} ${plan.popular ? styles.popular : ""}`}

whileHover={{
y:-10
}}

>


<h2>

{plan.name}

</h2>


<div className={styles.price}>
{plan.price}
<span>/month</span>
</div>


<p>

{plan.description}

</p>



<ul>

{plan.features.map((feature)=>(

<li key={feature}>

✓ {feature}

</li>

))}

</ul>


{plan.name === "Free" ? (
  <button onClick={() => navigate("/signup")}>
    Create free account
  </button>
) : (
  <p className={styles.unavailable} role="status">
    Billing is not configured.
  </p>
)}


</motion.article>

)


})}


</section>


</main>

);

}
